import { setupDatabase, teardownDatabase } from './database.js';

const jwt = require("jsonwebtoken");
const { idGenerator } = require("../src/concerns/id.js");
const Fakerator = require("fakerator");
const sha256 = require("crypto-js/sha256");
const { take, shuffle } = require("lodash");

const fake = Fakerator();

const userFactory = () => {
  const scopes = ["admin", "guest", "users:read", "tokens:read"];
  const email = fake.internet.email();

  return {
    id: email,
    email,
    name: fake.names.name(),
    password: idGenerator(),
    scopes: take(shuffle(scopes), fake.random.number(scopes.length)),
  };
};

const Token = {
  createToken: async (s3db, email, password) => {
    const user = await s3db.resource("users").get(email);

    if (user.password !== password) {
      console.log({ user, email, password });
      throw new Error("invalid-user");
    }

    const data = {
      name: user.name,
      email: user.email,
      scopes: user.scopes,
      email_verified: true,
    };

    const token = jwt.sign(data, ENV.PASSPRHASE, {
      expiresIn: "2s",
      subject: "test",
      issuer: "s3db.js",
      audience: "default",
    });

    const decoded = jwt.decode(token, ENV.PASSPRHASE);

    await s3db.resource("tokens").insert({
      id: sha256(token).toString(),
      ...decoded,
    });

    return token;
  },

  validateToken: async (client, token) => {
    const tokenId = sha256(token).toString();

    try {
      const decoded = jwt.decode(token, ENV.PASSPRHASE);
      const savedToken = await client.resource("tokens").get(tokenId);

      return [null, { decoded, savedToken }];
    } catch (error) {
      return [error];
    }  } finally {
    await teardownDatabase();
  }
  },
};

async function main() {
  const s3db = await setupDatabase());await s3db.createResource({
    name: "users",
    attributes: {
      name: "string",
      email: "string",
      password: "secret",
      scopes: "array|items:string",
    },
  });

  await s3db.createResource({
    name: "tokens",
    attributes: {
      iss: ["string", "url"],
      sub: "string",
      aud: "string",
      exp: "number",
      email: "email",
      name: "string",
      email_verified: "boolean",
      scopes: "array|items:string",
    },
  });

  const users = new Array(5).fill(0).map(userFactory);
  await s3db.resource("users").insertMany(users);

  let tokens = [];
  process.stdout.write("Created tokens: ");
  for (const user of users) {
    const token = await Token.createToken(s3db, user.email, user.password);
    tokens.push(token);
    process.stdout.write(".");
  }

  process.stdout.write("\nValidated tokens: ");
  for (const token of tokens) {
    const [error, data] = await Token.validateToken(s3db, token);
    if (!error) {
      process.stdout.write(".");
    }
  }
}

main();