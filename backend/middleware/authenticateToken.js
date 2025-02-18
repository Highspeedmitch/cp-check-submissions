const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from "Bearer <token>"
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

module.exports = authenticateToken;
