import { Amplify } from "aws-amplify";

const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";
const redirectUrl = isLocal ? "http://localhost:5173/" : "https://main.d2nheaqmsqnih6.amplifyapp.com/";

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_J2pk0B0iC",
      userPoolClientId: "4bgtkbf6p5433rhlgbv1qq1mvk",
      loginWith: {
        email: true,
        oauth: {
          domain: "obsidian-archive.auth.us-east-1.amazoncognito.com",
          scopes: ["email", "openid", "profile", "aws.cognito.signin.user.admin"],
          redirectSignIn: [redirectUrl],
          redirectSignOut: [redirectUrl],
          responseType: "code"
        }
      }
    }
  }
};

Amplify.configure(amplifyConfig);
