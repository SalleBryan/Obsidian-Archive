# Obsidian Archive

### Codebase & Architecture Deep Dive

*A function-by-function walkthrough of every file, and an explanation of how each AWS service and code entity interacts to form the platform.*


## Part 0 — The Architecture at a Glance

Obsidian Archive is a fully serverless book-reading platform. There is no always-on server; instead, managed AWS services each own one responsibility, and they hand work to each other in a chain. Understanding the platform means understanding that chain.


### The cast of services and what each one owns

- Amazon Cognito — identity. It stores user accounts, verifies emails, and issues signed JWT tokens that prove 'this request really is from user X'.
- Amazon API Gateway — the front door. Every HTTP request from the browser hits API Gateway first. It validates the Cognito token (for protected routes) and forwards the request to exactly one Lambda function.
- AWS Lambda — the logic. Six small Python functions, each with a narrow job: read data, queue a write, consume a write, mint file URLs, manage profiles, track reading progress. They run only while a request is in flight.
- Amazon DynamoDB — the database. Five tables (books, profiles, requests, notifications, progress). Key-value with secondary indexes for the few query patterns the app needs.
- Amazon SQS — the buffer. A queue that sits between 'the user asked to write something' and 'the write actually happens', so the API can answer instantly and writes can retry safely.
- Amazon S3 — the file store. Two buckets: one public (cover images), one private (the actual EPUB/PDF files, reached only through short-lived signed URLs).
- AWS CDK — the blueprint. A Python program that declares all of the above; running it provisions or updates the entire stack.
- React + Vite + Amplify — the client. A single-page app; Amplify is the library that talks to Cognito and attaches the JWT to API calls.

### The two lifecycles that explain everything


#### Reads take the fast path

A read (browse books, open a book, list notifications) flows: Browser → API Gateway → Reader/Upload Lambda → DynamoDB/S3 → back. It is synchronous and immediate because reads are cheap and safe to serve directly.


```text
Browser  ──GET──▶  API Gateway  ──▶  reader.py  ──▶  DynamoDB  ──▶  JSON response
```


#### Writes take the safe path (CQRS)

A write (create/edit/delete a book, make a request, mark a notification read) is split in two — a pattern called CQRS (Command Query Responsibility Segregation). The browser's request only travels as far as the writer Lambda, which validates it, stamps the caller's verified identity onto it, and drops a message on SQS. The API returns 202 Accepted immediately. Separately, the consumer Lambda picks the message off the queue and performs the real DynamoDB write.


```text
Browser ─POST─▶ API Gateway ─▶ writer.py ─▶ SQS queue ─▶ consumer.py ─▶ DynamoDB
                                   │
                                   └─▶ returns 202 immediately (does not wait for the write)
```

Why bother? Three payoffs: (1) the user gets an instant response even if the write is slow; (2) if the write fails, SQS automatically retries, and after 3 failures the message lands in a Dead Letter Queue for inspection instead of being lost; (3) the writer can stamp identity server-side so the client can never forge who owns a book. The one trade-off is eventual consistency: a brand-new book may take a moment to appear.


### How identity flows through the whole system

1. The user signs in; Cognito returns a JWT (a signed token containing their unique id 'sub' and email).
1. Amplify stores that token and, on every protected API call, attaches it as 'Authorization: Bearer <token>'.
1. API Gateway's Cognito Authorizer validates the token's signature and expiry BEFORE the Lambda runs. An invalid token never reaches your code.
1. The Lambda reads the already-verified claims from event['requestContext']['authorizer']['claims'] — it trusts these because the gateway validated them.
1. For writes, the writer Lambda copies 'sub' into ownerId. This is why a user can never claim to own someone else's book: the client doesn't get to set ownerId — the server does, from the verified token.

## Part 1 — The Infrastructure Blueprint (red_rising_cdk_stack.py)

This one Python file is the single source of truth for every AWS resource. CDK 'synthesises' it into a CloudFormation template that AWS deploys. Because everything is declared in one place, resources can reference each other by variable, and permissions are wired explicitly. Reading it top to bottom:


#### Section 1 — Cognito User Pool & Client

Creates the user directory. Key settings: sign-in by email; auto-verify email; a branded HTML verification email with the {####} code; a password policy (8+ chars, upper/lower/digit). A post-confirmation trigger (auth_trigger.py) is attached so a profile row is created the instant a user verifies. The User Pool Client is the browser-facing credential; it enables the user-password and SRP auth flows and whitelists the localhost + Amplify callback URLs for OAuth. Google federation is wired conditionally if GOOGLE_CLIENT_ID/SECRET env vars are present.


#### Section 2 — DynamoDB tables

Five tables, all PAY_PER_REQUEST (no capacity planning) and RETAIN on delete (data survives a stack teardown):

- BooksTable — PK bookId. GSI 'OwnerIndex' (ownerId+createdAt) powers 'my books'; GSI 'VisibilityIndex' (visibility+createdAt) powers the public library query.
- ProfilesTable — PK userId.
- RequestsTable — PK requestId. GSI 'StatusIndex' (status+createdAt) to list open requests.
- NotificationsTable — PK userId + SK notificationId, so one query returns all of a user's notifications.
- ProgressTable (new) — PK userId + SK bookId, so one query returns everything a user is currently reading. This is the cross-device reading-progress store.

#### Section 3 — SQS main queue + Dead Letter Queue

The DLQ retains failed messages 14 days. The main queue has a 60-second visibility timeout and a redrive policy: after 3 failed processing attempts a message moves to the DLQ instead of looping forever. This is the safety net behind every write.


#### Section 4 — S3 buckets

- CoversBucket — public-read (cover images are meant to be seen by anyone), CORS-enabled for direct browser PUT during upload.
- FilesBucket — BLOCK_ALL public access. The actual books live here and are only ever reachable through a presigned URL minted server-side after an ownership check.

#### Section 5 — the six Lambda functions and their permissions

All share one code asset ('lambda/' folder) and a common_env dict of table/bucket names. Crucially, each function is granted ONLY the permissions it needs (least privilege):

- writer_fn — may send to SQS. It cannot touch DynamoDB at all.
- consumer_fn — read/write on all tables + buckets; triggered by SQS (batch size 5).
- reader_fn — read-only on books/requests/notifications.
- upload_fn — read/write both buckets + read books (to check ownership before minting URLs).
- profile_fn — read/write profiles.
- progress_fn (new) — read/write the progress table only.
- auth_trigger_fn — write profiles; wired as the Cognito post-confirmation trigger.

#### Section 6 — API Gateway routes

A REST API with a Cognito Authorizer. The routing table is the contract between frontend and backend. Note the recurring 'public vs /auth' pattern: many resources expose an unauthenticated route AND an authenticated one, so the same Lambda can serve strangers (scrubbed data) and owners (full data):


```text
GET  /books                 → reader   (public list, PII scrubbed)
POST /books                 → writer   (auth)          
GET  /books/mine            → reader   (auth)          
GET  /books/{id}            → reader   (public)        
GET  /books/{id}/auth       → reader   (auth: owner sees private)
PUT/DELETE /books/{id}      → writer   (auth)          
GET  /books/{id}/read       → upload   (public: presigned URL, public books)
GET  /books/{id}/read-auth  → upload   (auth: presigned URL, private books)
POST /upload/cover|book     → upload   (auth)          
GET/POST /requests          → reader/writer            
PUT/DELETE /requests/{id}   → writer                   
GET/PUT /profile            → profile                  
GET/PUT /notifications      → reader/writer            
GET  /progress              → progress (auth: list)    
PUT/DELETE /progress/{id}   → progress (auth: upsert/remove)
```


## Part 2 — Backend Lambdas, Function by Function


### writer.py — validates and queues every write


**`lambda_handler(event, context)`**  
The single entry point. Step by step: (1) decode the body (handling base64 for binary-safe payloads); (2) read 'operation' and flatten any nested 'payload' up into the body; (3) reject anything not in ALLOWED_OPERATIONS (a whitelist — CREATE_BOOK, UPDATE_BOOK, DELETE_BOOK, BATCH_DELETE_BOOKS, CREATE_REQUEST, FULFILL_REQUEST, DELETE_REQUEST, MARK_NOTIFICATION_READ); (4) pull the verified user_id and email from the Cognito claims; reject if absent (401); (5) compute is_admin; (6) — the security-critical step — inject server-verified identity into the body: ownerId and uploaderName for book ops, requesterId for requests, etc. The client's own values for these are ignored. (7) send the enriched message to SQS and return 202. The writer NEVER writes to the database itself.

This is where 'you can only own what you uploaded' is enforced. Because ownerId is overwritten with the token's 'sub', a malicious client cannot POST a book claiming someone else owns it.


### consumer.py — performs the real writes


**`lambda_handler(event, context)`**  
Triggered by SQS with a batch of up to 5 messages. Loops over records and calls process_message on each. If one throws, SQS re-delivers it (up to 3 times) and then routes it to the DLQ.


**`process_message(body)`**  
The dispatcher. Branches on 'operation' and executes the actual DynamoDB mutation:

- CREATE_BOOK — generates a uuid bookId, assembles the item (title, author, category, the new multi-genre 'categories' list, visibility, timestamps, optional series/cover/file fields) and put_items it. If the book is public, it then calls notify_matching_requesters so anyone who requested that title gets a notification.
- UPDATE_BOOK — re-reads the book, verifies ownerId matches (or is_admin), then builds a dynamic UpdateExpression from only the fields present in the message (including 'categories'). Fields not sent are left untouched.
- DELETE_BOOK / BATCH_DELETE_BOOKS — ownership-checked deletes; also deletes the S3 objects via delete_s3_object.
- CREATE_REQUEST / FULFILL_REQUEST / DELETE_REQUEST — manage the community request board; fulfilling records who fulfilled it.
- MARK_NOTIFICATION_READ — flips a notification's read flag.

**`notify_matching_requesters(book_id, book_title, uploader_name, now)`**  
When a public book is created, scans open requests for a title match and writes a notification row per matching requester — this is the 'someone uploaded the book you asked for' feature.


**`delete_s3_object(bucket, key)`**  
Best-effort S3 delete used during book deletion so orphaned files don't accumulate.


### reader.py — every GET, with privacy control


**`client_book(book)`**  
Strips fields NO client ever needs: the raw S3 fileKey (internal storage path) and stored PII (userEmail, uploaderName). Because reading always goes through a presigned URL, the client only needs to know a file EXISTS — so this adds a boolean hasFile instead. ownerId is kept, so the UI can still show owner-only Edit/Delete actions. Applied to the authenticated responses (/books/mine, /books/{id}/auth).


**`public_book(book)`**  
Everything client_book strips, PLUS ownerId — so an unauthenticated caller can never see who owns a book, and never sees internal storage keys. Applied to every UNauthenticated response (/books, public /books/{id}). This closes the leak where the public library response exposed ownerId (other users' Cognito identity) and fileKey (internal S3 paths).


**`lambda_handler(event, context)`**  
Branches on event['resource']:

- /books — queries VisibilityIndex for public books, returns them scrubbed via public_book.
- /books/mine — requires auth; queries OwnerIndex for the caller's own books (full data).
- /books/{bookId} — public route: 404 if missing, 403 if private, otherwise the scrubbed book.
- /books/{bookId}/auth — authenticated route: same lookup, but a private book is allowed through if the caller is the owner or a super-admin, and returns FULL data. This split is why an owner can open their own private book while a stranger cannot.
- /notifications — returns the caller's notifications, newest first.
- /requests — returns the request board.

### upload.py — the S3 gatekeeper


**`lambda_handler(event, context)`**  
Two jobs behind presigned URLs:

- Reading (/books/{id}/read and /read-auth) — looks up the book, enforces privacy (private books require owner/admin on the -auth route), then mints a 1-hour presigned GET URL for the file. It deliberately returns only the opaque URL plus title/author/fileType — never the internal S3 fileKey.
- Uploading (/upload/cover, /upload/book) — auth required; generates a uuid-based S3 key and a presigned PUT URL that INCLUDES ContentType in the signature (omitting it caused the earlier mobile-upload 403s). It echoes the contentType back so the browser signs with the identical value. The book endpoint also enforces the 100 MB size cap.

### profile.py — user profiles


**`lambda_handler(event, context)`**  
GET returns the caller's profile; PUT updates displayName and requestNotifications via a DynamoDB update_item. Direct read/write (not through SQS) because profile edits are low-volume and want an immediate confirmation.


### progress.py — cross-device reading progress (NEW)

This Lambda is the backend half of the new 'continue reading, on any device' feature. One DynamoDB row per (userId, bookId).


**`lambda_handler(event, context)`**  
Requires auth (reads 'sub' from claims). Branches on HTTP method:

- GET /progress — query the ProgressTable by userId and return every in-progress book, newest first.
- PUT /progress/{bookId} — upsert one row: percent (clamped 0–100), position (the EPUB CFI or PDF page number), fileType, title, author, and a server millisecond timestamp updatedAt. put_item overwrites, so repeated saves are idempotent.
- DELETE /progress/{bookId} — remove a book from the user's progress (a future 'remove from Continue Reading').
Direct DynamoDB writes (not via SQS) because progress updates are frequent and tiny; the client debounces them so writes stay cheap.


### auth_trigger.py — profile bootstrap


**`lambda_handler(event, context)`**  
Cognito calls this the moment a user confirms their email. It writes a minimal profile row (userId = Cognito sub, email, displayName from the username) so every authenticated user always has a profile, with no separate onboarding step.


## Part 3 — Frontend Architecture (after the split)

The frontend was one 4,145-line App.jsx. It is now split into focused modules under src/, which is how the rest of this document is organised. The dependency direction is clean and one-way: pages and components depend on the shared infrastructure modules (api, config, constants, lib, styles), never the other way around.


```text
src/
  App.jsx              ← root: <App/> + <AppShell/> (routing, nav, auth modal, notifications)
  config.js            ← API base URL, endpoint map (EP), super-admin check
  constants.js         ← CATEGORIES, category colours
  api.js               ← the API client object (one method per backend route)
  styles.js            ← the global CSS string
  amplifyConfig.js     ← Cognito/Amplify configuration (side-effect import)
  lib/
    progress.js        ← reading-progress: localStorage cache + cloud sync
    upload.js          ← XHR direct-to-S3 upload helper (mobile-safe)
  components/
    shelves.jsx        ← BookCoverShelfItem, HorizontalShelf, ContinueReadingShelf, BookCardItem
  pages/
    PublicLibraryPage, MyCollectionPage, RequestsBoardPage, UploadBookPage,
    BookDetailPage, EditBookPage, OnlineReaderPage, UserProfilePage
  reader/
    EpubViewer.jsx     ← epub.js reader (paginated, two-page spread, search, swipe)
    PdfViewer.jsx      ← PDF.js canvas reader (two-page spread, slider, swipe)
```


### How the frontend talks to the backend

Every network call goes through the single 'api' object in api.js. Each method awaits getAuthHeader() first, which asks Amplify for the current JWT and returns it as an Authorization header (or {} when logged out). This one indirection is why the whole app stays authenticated without any component thinking about tokens.


## Part 4 — Shared Frontend Modules


### config.js

- API_BASE — the API Gateway base URL.
- EP — a map of endpoint URLs (books, booksMine, uploadCover, uploadBook, requests, profile, notifications, and the new progress).
- SUPER_ADMIN_EMAILS + checkIsSuperAdmin(user) — returns true for the platform owners; used by AppShell to grant admin UI.

### constants.js

- CATEGORIES — the full genre list, now including Dystopian, Thriller, Horror, Historical Fiction, Young Adult, etc.
- CAT_COLORS + getCatColor(cat) — a stable colour per genre for cover placeholders and accents.

### api.js — the API client, method by method


**`getAuthHeader()  (internal)`**  
Awaits Amplify's fetchAuthSession() and returns { Authorization: 'Bearer <idToken>' }, or {} if not signed in.

Public catalogue: getPublicBooks, getBookById (falls back between /auth and public), getMyBooks. Book writes (all POST/PUT/DELETE that wrap operations for the writer Lambda): createBook, updateBook, deleteBook, batchDeleteBooks. Reading: getBookReadUrl (calls /read-auth when logged in, /read otherwise). Uploads: uploadCoverFile and uploadBookFile (get a presigned URL, then delegate to uploadToS3). Requests: getRequests, createRequest, fulfillRequest, deleteRequest. Notifications: getNotifications, markNotificationRead. Profile: getProfile, updateProfile.


**`getProgress()  ·  saveProgress(bookId, payload)  ·  deleteProgress(bookId)   (NEW)`**  
The three calls to the progress Lambda: list all in-progress books, upsert one book's progress, remove one.


### lib/upload.js


**`uploadToS3(uploadUrl, file, contentType, onProgress)`**  
A promise-wrapped XMLHttpRequest PUT straight to S3. It first reads the file into an ArrayBuffer/Blob to sidestep an Android bug where content:// streams lock; it reports progress via xhr.upload.onprogress; and it sends the exact contentType that was signed. This is the mobile-robust upload path.


### lib/progress.js — the reading-progress engine (local + cloud)


**`readingListKey(userId)  ·  getReadingList(userId)  ·  upsertReadingProgress(userId, entry)`**  
The localStorage layer: an instant, per-device list of {bookId, title, author, fileType, percent, position, updatedAt}, capped at 60 and kept newest-first. This is what makes 'Continue Reading' appear immediately with zero network latency.


**`syncProgressToCloud(userId, entry)   (NEW)`**  
The cloud mirror. Skips guests. Debounces per book by ~4 seconds (using a per-bookId timer) so that turning pages rapidly collapses into a single DynamoDB write via api.saveProgress. This keeps cross-device sync cheap.


**`loadMergedReadingList(userId)   (NEW)`**  
Called by the library. Returns the local list instantly, then fetches cloud progress (api.getProgress) and merges the two, letting the most-recently-updated record win per book. It writes the merged result back to localStorage AND hydrates each book's per-book resume key (obsidian_pos_… for EPUB, obsidian_pdfpage_… for PDF) so that opening a book on a new device continues exactly where another device left off.


**`hydrateBookPosition(userId, bookId)   (NEW)`**  
The reader-side counterpart. OnlineReaderPage calls it (in parallel with fetching the read URL) so that opening a book DIRECTLY on a fresh device — without first visiting the library — still seeds the local resume key from the cloud before the viewer mounts. Local position wins if one already exists on this device.


### styles.js

A single exported CSS string injected once via <style> in AppShell. It defines the whole visual system: the Google-Play-Books shelves, cards, reader chrome, nav buttons (.reader-nav-btn), and the responsive .epub-canvas-container whose max-width breakpoints (620 / 1100 / 1360 px) let the EPUB two-page spread widen on larger screens.


## Part 5 — Components & Pages


### components/shelves.jsx


**`BookCoverShelfItem({ book, size, onSelect })`**  
One cover tile used across horizontal shelves; renders the S3 cover image or a coloured placeholder, plus a series badge.


**`HorizontalShelf({ title, subtitle, books, onSelectBook, size })`**  
A titled, horizontally-scrolling row of BookCoverShelfItems. Returns null when empty.


**`ContinueReadingShelf({ entries, coverMap, onOpenReader })  (NEW)`**  
The progress-aware shelf. For each reading-list entry it joins to coverMap (books already fetched) for a cover, shows a gold progress bar pinned to the bottom of the cover, the % in the caption, a fileType badge, and a hover 'Resume' overlay. Clicking opens the reader directly (onOpenReader → /read/{id}).


**`BookCardItem({ book, onSelect })`**  
The grid card (with a public/private badge) used in the full-library grid view.


### pages/PublicLibraryPage.jsx

The public catalogue. loadBooks() fetches public books. useMemo builds categorizedShelves — and note it now honours the multi-genre 'categories' array (falling back to the legacy single 'category'), so a book tagged Sci-Fi + Dystopian appears on both shelves. Three tabs: Ebooks (curated shelves), Series & Sagas (grouped by seriesName), Genres & Categories (one shelf per genre). A search box filters by title/author/series.


### pages/MyCollectionPage.jsx

The signed-in user's library. loadBooks() fetches the user's own books AND public books in parallel, building a coverMap so the Continue Reading shelf can show covers even for public titles the user is reading but doesn't own. A second effect shows the local reading list instantly then reconciles it with the cloud via loadMergedReadingList. The 'all' tab renders, in order: the real ContinueReadingShelf (with %), a dedicated Private Collection shelf (visibility === 'private'), and the full All Books grid. The empty-state only shows when both owned books and reading entries are empty.


### pages/UploadBookPage.jsx


**`handleSave(e)`**  
Orchestrates the multi-step upload: optionally upload the cover (api.uploadCoverFile), upload the book file (api.uploadBookFile, with a live progress bar), then POST the metadata (createBook). The genre selector is a multi-select pill grid writing to formData.categories; the payload sends both 'categories' (array) and a legacy 'category' (first genre) for GSI compatibility.


### pages/BookDetailPage.jsx


**`fetchBook()`**  
Gated on authChecked (waits for Amplify) then fetches the book — via the /auth route when logged in so owners can see private books. Renders cover, metadata, genres, series, and owner/admin actions (Read, Edit, Delete, or Request when no file exists).


### pages/EditBookPage.jsx


**`fetchBook() / handleUpdate(e)`**  
Loads current metadata into a form (pre-selecting the multi-genre pills), then api.updateBook sends an UPDATE_BOOK through the writer→SQS→consumer chain.


### pages/RequestsBoardPage.jsx


**`loadRequests() / handleCreateRequest()`**  
The community board: list open requests; authenticated users create one; admins fulfil them. Fulfilment + matching public uploads drive the notification system.


### pages/UserProfilePage.jsx


**`loadProfile() / handleSave()`**  
Loads and saves displayName, bio, and the requestNotifications preference via api.getProfile/updateProfile.


### pages/OnlineReaderPage.jsx — the reader shell


**`fetchReadUrl()`**  
Gated on authChecked, calls api.getBookReadUrl(bookId) to obtain the presigned URL + fileType (and, in parallel, hydrateBookPosition to seed the cloud resume position), then renders EpubViewer or PdfViewer accordingly.

It owns the reader chrome: the theme (dark/sepia/light), font size, fullscreen, and the three-dots (⋮) menu. The header carries an explicit z-index (100) so its dropdown menu paints ABOVE the book's iframe/canvas — the fix for the mobile bug where book content covered the menu. It passes bookId, userId and author down so the viewers can persist progress.


## Part 6 — The Reader, Function by Function


### reader/EpubViewer.jsx

Renders EPUBs with epub.js inside a sandboxed iframe. Notable internals:


**`loadEpub()  (inside the load effect)`**  
Streams the EPUB with fetch + a ReadableStream reader so it can show a real download % for large books; merges the chunks into an ArrayBuffer; creates the rendition with spread:'auto' (which yields a two-page open-book layout on wide screens and a single page on mobile); restores the saved CFI from localStorage (falling back to the start if stale); then renders immediately and generates locations in the BACKGROUND so the book is readable before the progress bar is ready.


**`rendition.on('relocated', …)`**  
Fires on every page turn. Saves the CFI to localStorage, computes % from locations, and records the book in both the local reading list (upsertReadingProgress) and — debounced — the cloud (syncProgressToCloud), storing the CFI as 'position'.


**`rendition.on('keydown', …)  +  window keydown effect`**  
Because content lives in an iframe, keystrokes there are re-dispatched to window so the arrow-key / PageUp-Down navigation works. Escape closes the search and TOC panels.


**`handleTouchStart / handleTouchEnd`**  
Swipe navigation: a horizontal swipe > 60 px with vertical drift < 80 px turns the page — this is how mobile navigates (the side arrow buttons are hidden below 768 px via the isMobile state).


**`handleSearch()`**  
Uses book.search() across the spine, capping results at 30, rendered in a panel that jumps to the matched CFI.


### reader/PdfViewer.jsx

Renders PDFs with PDF.js onto canvases (replacing the old browser <iframe> embed) for full control of layout and theme:


**`load effect`**  
Dynamically imports pdfjs-dist (so it doesn't bloat the initial bundle), points the worker at the bundled worker file, opens the document with an onProgress download bar, and restores the saved page from localStorage.


**`render effect`**  
Renders the current page — or, on desktop (≥1024 px), the current page AND the next one side-by-side as an open-book spread — scaling each canvas to fit while preserving aspect ratio. It cancels any in-flight render before starting a new one.


**`progress effect`**  
On page change, saves the page to localStorage and records progress locally + to the cloud (page number as 'position').


**`keyboard + onTouchStart/onTouchEnd`**  
Arrow/PageUp-Down step by one page (two in spread mode); swipe does the same on mobile. A bottom slider jumps to any page and the counter shows '2–3 / 877' in spread mode.


## Part 7 — The Reading-Progress System, End to End (NEW)

This feature spans the whole stack. Tracing one page turn on a phone, then reopening on a laptop:

1. On the phone, the reader turns a page. EpubViewer/PdfViewer immediately writes to localStorage (instant, offline-safe) via upsertReadingProgress — so Continue Reading and resume work even with no network.
1. The same call fires syncProgressToCloud, which waits ~4 seconds (debounced) and then PUTs to /progress/{bookId}. The progress Lambda upserts one DynamoDB row keyed by (userId, bookId) with percent, position (CFI/page), and a server timestamp.
1. Later, on the laptop, the user opens My Collection. loadMergedReadingList shows the local list instantly, then GETs /progress, merges cloud + local (newest updatedAt wins per book), and rewrites the local cache.
1. Crucially, that merge also HYDRATES each book's per-book resume key in localStorage (obsidian_pos_… / obsidian_pdfpage_…). So when the user clicks Resume, the reader finds the phone's position already present and opens to the exact spot.
Design choices, and why: localStorage is the source of instant truth (no spinner); the cloud is the source of cross-device truth (authoritative merge). Guests never hit the network. Writes are debounced so frequent page turns cost one write, not dozens. The one caveat: cross-device resume is hydrated when the library is visited; opening a brand-new device straight into the reader (never touching the library) would not yet have the remote position.


## Part 8 — End-to-End Lifecycles


### Uploading a book

1. UploadBookPage.handleSave requests a presigned cover URL (POST /upload/cover → upload Lambda).
1. Browser PUTs the cover straight to the public S3 bucket using the signed URL and matching ContentType.
1. Requests a presigned book URL (POST /upload/book), then PUTs the EPUB/PDF to the private bucket (uploadToS3, with progress).
1. POSTs metadata (POST /books → writer). Writer stamps ownerId from the token, queues CREATE_BOOK on SQS, returns 202.
1. Consumer writes the book row; if public, notify_matching_requesters alerts anyone who requested that title.

### Reading a private book

1. OnlineReaderPage waits for authChecked, then GET /books/{id}/read-auth with the JWT.
1. Upload Lambda verifies ownerId === caller (or admin), mints a 1-hour presigned GET URL, returns it (never the fileKey).
1. The viewer streams the file from S3 via that URL and restores the saved position.

### Request → fulfil → notify

1. A reader POSTs a request (writer → SQS → consumer writes it to RequestsTable).
1. Someone later uploads a matching PUBLIC book; the consumer's notify_matching_requesters writes a notification row.
1. The requester's client polls GET /notifications (every 30 s in AppShell) and shows the bell badge.

## Part 9 — Security Model (how the pieces protect each other)

- Authentication is delegated entirely to Cognito; API Gateway validates the JWT before any Lambda runs, so unverified requests never reach your code.
- Authorisation is defence-in-depth: privacy is enforced in reader.py (metadata) AND upload.py (the file URL), so knowing a private bookId still gets a stranger nothing.
- Identity can't be forged: the writer overwrites ownerId/requesterId with the token's 'sub' — the client's values are ignored.
- PII and internal paths never leak: client_book() strips the S3 fileKey and stored PII from EVERY response (exposing only a hasFile boolean); public_book() additionally strips ownerId on unauthenticated routes. This closed a real leak where the public /books list exposed other users' ownerId (Cognito identity) and internal fileKeys.
- A note on the current user's own email: it is inherently present in that user's own JWT and Cognito session, visible in their own browser's devtools. That is not a cross-user leak (an attacker seeing it already controls that user's session) and cannot be hidden from the user themselves.
- Least privilege: each Lambda holds only the IAM grants it needs (writer can only enqueue; reader is read-only).
- Private files are never public: the FilesBucket blocks all public access; every read is a short-lived, server-authorised presigned URL.
- Writes are durable: SQS retries failures and preserves poison messages in a DLQ rather than losing them.

## Appendix — File Map

- `red-rising-cdk/red_rising_cdk/red_rising_cdk_stack.py` — All AWS resources (Cognito, DynamoDB×5, SQS, S3×2, 6 Lambdas, API routes)
- `red-rising-cdk/lambda/writer.py` — Validates + queues writes to SQS
- `red-rising-cdk/lambda/consumer.py` — Consumes SQS → DynamoDB writes + notifications
- `red-rising-cdk/lambda/reader.py` — All GETs; PII scrubbing; public vs owner access
- `red-rising-cdk/lambda/upload.py` — Presigned S3 URLs for read + upload
- `red-rising-cdk/lambda/profile.py` — Profile GET/PUT
- `red-rising-cdk/lambda/progress.py` — Cross-device reading progress (NEW)
- `red-rising-cdk/lambda/auth_trigger.py` — Cognito post-confirmation → create profile
- `frontend/src/App.jsx` — Root + AppShell (routing, nav, auth modal, notifications)
- `frontend/src/config.js` — API base, endpoint map, super-admin check
- `frontend/src/constants.js` — Genres + colours
- `frontend/src/api.js` — API client (one method per route)
- `frontend/src/styles.js` — Global CSS
- `frontend/src/lib/progress.js` — Reading progress: localStorage + cloud sync (NEW)
- `frontend/src/lib/upload.js` — Mobile-safe direct-to-S3 upload
- `frontend/src/components/shelves.jsx` — Shelf/card components incl. ContinueReadingShelf
- `frontend/src/pages/*.jsx` — 8 page components
- `frontend/src/reader/EpubViewer.jsx` — EPUB reader
- `frontend/src/reader/PdfViewer.jsx` — PDF reader
