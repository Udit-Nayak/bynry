// Placeholder auth middleware.
// In a real app this would verify a JWT and attach the decoded user to req.user.
// Kept minimal here since auth isn't the focus of this task.
const authenticate = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  // TODO: verify JWT, decode payload, attach to req.user
  next();
};

module.exports = { authenticate };
