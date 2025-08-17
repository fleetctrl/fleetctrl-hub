require("dotenv").config({ path: "../../.env" });
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const payload = {
  role: "anon",
  iss: "supabase",
  iat: 1753826400,
  exp: 1911592800,
};

const token = jwt.sign(payload, JWT_SECRET, {
  algorithm: "HS256",
  noTimestamp: true,
});
console.log(token);
