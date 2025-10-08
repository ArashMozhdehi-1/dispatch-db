import { ApolloServer } from 'apollo-server-micro';
import { typeDefs } from '../../lib/schema';
import { resolvers } from '../../lib/resolvers';
import cors from 'cors';

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  playground: true,
  context: ({ req }) => {
    return { req };
  },
});

const startServer = apolloServer.start();

export default async function handler(req, res) {
  // Enable CORS
  await new Promise((resolve, reject) => {
    cors({
      origin: true,
      credentials: true,
    })(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });

  await startServer;
  await apolloServer.createHandler({ path: '/api/graphql' })(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

