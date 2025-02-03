const authorizeRoles = (...roles) => {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied. Insufficient permissions." });
      }
      next();
    };
  };
  
  const bodyParser = require('body-parser');

// Increase the limit for JSON requests (for image uploads)
app.use(bodyParser.json({ limit: '10mb' })); // Adjust the size as needed

  module.exports = authorizeRoles;
  