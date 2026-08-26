import { Amplify } from "aws-amplify";

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_J2pk0B0iC",
      userPoolClientId: "4bgtkbf6p5433rhlgbv1qq1mvk",
      loginWith: {
        email: true,
      },
    },
  },
};

Amplify.configure(amplifyConfig);
