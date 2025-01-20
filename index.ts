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
        serviceUnavailable: Response # 503 i.e. from CDN
        combinedError: Response
        networkError: Response
        requestTimeout(time: Int!): Response # waits for given seconds and timeouts
        other: Response # for example TypeError returned - not expected on FE side
        antiPattern: AntiPatternResponse
        gqlError: Body
    }
`;

// A map of functions which return data for the schema.
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
      throw new GraphQLError("Custom error", {
        extensions: {
          code: "GQL_ERROR",
        },
      });
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
