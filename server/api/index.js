// Vercel Function entrypoint for the drio-server Express app.
//
// This file stays plain CommonJS because Vercel compiles the /api directory
// itself. The implementation is TypeScript: src/vercel.ts, emitted by
// `npm run build` to dist/vercel.js (see ../vercel.json for buildCommand).
//
// Vercel rewrites every request to this function and passes the original path
// through, so the Express app in src/app.ts sees the same URLs it serves on
// Render (/api/v1/..., /api/auth/..., /api/places/..., /api/routes/...).
module.exports = require('../dist/vercel.js').default;
