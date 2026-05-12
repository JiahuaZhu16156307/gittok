import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      image?: string;
      githubToken: string;
    };
  }

  interface User {
    id: string;
    githubToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    githubToken?: string;
  }
}
