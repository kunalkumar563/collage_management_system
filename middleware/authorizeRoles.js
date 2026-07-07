/**
 * authorizeRoles(...allowedRoles)
 *
 * Usage (always place AFTER verifyToken):
 *   router.delete("/:id", verifyToken, authorizeRoles("admin"), deleteStudent);
 *   router.get("/",       verifyToken, authorizeRoles("admin","faculty"), getAllStudents);
 *
 * How it works:
 *   1. verifyToken already decoded the JWT and stored { id, role } in req.user
 *   2. This middleware checks whether req.user.role is inside the allowed list
 *   3. If yes  → calls next() and the request continues to the controller
 *   4. If no   → returns 403 Forbidden immediately, controller never runs
 */

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user is set by verifyToken — if it is missing, token was not verified
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if the logged-in user's role is in the allowed list
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}. Your role: ${req.user.role}`,
      });
    }

    next(); // role is allowed — continue to controller
  };
};

module.exports = authorizeRoles;
