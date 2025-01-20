import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";
import { GraphQLError } from "graphql";
import {
  ApolloServerErrorCode,
  ApolloServerValidationErrorCode,
} from "@apollo/server/errors";
import path from "node:path";
import { renderFile } from "ejs";

// The GraphQL schema
const typeDefs = `#graphql
    type Body {
        value: String
        code: Int
    }
    type Response {
        body: [String]
    }
    type AntiPatternResponse {
        body: Body
        errors: [Int]
    }

    type Query {
        notFound: Response # 404 not found
        authenticationFail: Response # 403 auth
        givenCode(code: Int!): Response # returns error with given error code
        requestTimeout(time: Int!): Response # waits for given seconds and timeouts
        other: Response # for example TypeError returned - not expected on FE side
        antiPattern: AntiPatternResponse
        gqlError: Body
        nonGqlError: Body
        networkError: Response
        # serviceUnavailable - mitigate 503 from CDN example
        # combinedError
    }
`;

// A map of functions which return data for the schema.
// ApolloServerErrorCode
// ApolloServerValidationErrorCode
const resolvers = {
  Query: {
    notFound: () => {
      return new GraphQLError("Not found - error occured", {
        originalError: new Error("not found"),
        extensions: {
          code: "NOT_FOUND",
        },
      });
    },
    authenticationFail: () => {
      return new GraphQLError(
        "You are not authorized to perform this action.",
        {
          extensions: {
            code: "FORBIDDEN",
          },
        }
      );
    },
    givenCode: (_, args) => {
      if (!args.code) {
        throw new GraphQLError("no error code", {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT,
          },
        });
      }

      throw new GraphQLError("error with code from arg", {
        extensions: {
          code: ApolloServerErrorCode.BAD_REQUEST,
          http: {
            status: args.code || 500,
          },
        },
      });
    },
    requestTimeout: async (_, args) => {
      if (!args.time) {
        throw new GraphQLError("no error code", {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT,
          },
        });
      }

      await new Promise((_, reject) => {
        setTimeout(reject, args.time);
      }).catch(() => {
        throw new GraphQLError("Request timeout", {
          extensions: {
            code: ApolloServerErrorCode.INTERNAL_SERVER_ERROR,
            // This causes 10 retries by default
            // http: {
            //   status: 408,
            // },
          },
        });
      });
    },
    networkError: () => {
      throw new GraphQLError("Request timeout", {
        extensions: {
          code: ApolloServerErrorCode.INTERNAL_SERVER_ERROR,
          // This returns networkError after 10 retries
          http: {
            status: 408,
          },
        },
      });
    },
    // unhandledError: () => {},
    other: () => {
      return new TypeError("not expected type error");
    },
    antiPattern: () => {
      return {
        body: {
          value: "",
          code: 404,
        },
        errors: null,
      };
    },
    gqlError: () => {
      throw new GraphQLError("Custom graphql error", {
        extensions: {
          code: "GQL_ERROR",
        },
      });
    },
    nonGqlError: () => {
      throw new Error("custom error code");
    },
  },
};

const app = express();
const httpServer = http.createServer(app);

const main = async () => {
  // Set up Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    // formatError: (formattedError, error) => {
    //   // Return a different error message

    //   if (
    //     formattedError.extensions.code ===
    //     ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED
    //   ) {
    //     return {
    //       ...formattedError,
    //       message:
    //         "Your query doesn't match the schema. Try double-checking it!",
    //     };
    //   }
    //   // Otherwise return the formatted error. This error can also
    //   // be manipulated in other ways, as long as it's returned.

    //   return formattedError;
    // },
  });
  await server.start();

  app.set("views", path.join("views"));
  app.engine("html", renderFile);
  app.set("view engine", "html");
  app.use(cors(), bodyParser.json());
  app.use("/api/query", expressMiddleware(server));
  // error route where we return HTML markup
  app.get("/", (_, res) => {
    // res.status(500).send({ error: "something blew up" });
    res.status(500).render("index");
  });

  await new Promise((resolve) =>
    httpServer.listen({ port: 4000 }, () => resolve)
  );
};

main();
console.log(`🚀 Server ready at http://localhost:4000`);
