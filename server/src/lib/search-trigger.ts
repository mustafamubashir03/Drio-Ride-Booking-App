/**
 * Should a request trigger a driver-search sweep?
 *
 * Exported and pure so it can be tested against real Express routing instead of
 * being asserted by inspection. The previous implementation compared against
 * "/passenger" and matched nothing, because a middleware mounted at the app root
 * sees the FULL path ("/api/v1/passenger/bookings") - Express only strips the
 * mount prefix inside the mounted router, never for app-level middleware.
 *
 * The matcher therefore works on the full request path and only accepts the
 * passenger/driver route families that carry booking or ride state. It must not
 * fire for unrelated routes (auth, places, routes, health, diagnostics), because
 * every trigger costs a Mongo sweep query.
 */
const SEARCH_TRIGGER_ROUTES = /^\/api\/v\d+\/(passenger|driver)(\/|$)/;

export const shouldTriggerSearchSweep = (path: string): boolean =>
    SEARCH_TRIGGER_ROUTES.test(path);