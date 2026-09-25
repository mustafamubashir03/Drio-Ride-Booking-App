import type * as BetterAuthPlugins from "better-auth/plugins" with { "resolution-mode": "import" };

type CreateAccessControl = typeof BetterAuthPlugins.createAccessControl;
type AccessControl = ReturnType<CreateAccessControl>;
type Role = ReturnType<AccessControl["newRole"]>;

export const statements = {
    user: ["create", "list", "get", "update", "delete", "set-role"],
    session: ["list", "revoke"],
    booking: ["create", "read", "list", "update", "cancel"],
} as const;

// better-auth is ESM-only, so createAccessControl() cannot be called at import
// time from this CommonJS build. The access control and the roles derived from
// it are therefore built by initRbac(), which src/lib/auth.ts calls with the
// dynamically imported factory. Both bootstraps run initAuth() before the
// server accepts a request, so these getters always find a value.
let accessControl: AccessControl | undefined;
let passengerRole: Role | undefined;
let driverRole: Role | undefined;
let adminRole: Role | undefined;
let defaultRoles: { passenger: Role; driver: Role; admin: Role } | undefined;

export const initRbac = (createAccessControl: CreateAccessControl) => {
    if (accessControl) return;

    accessControl = createAccessControl(statements);

    passengerRole = accessControl.newRole({
        user: ["get"],
        session: ["list", "revoke"],
        booking: ["create", "read", "list", "cancel"],
    });

    driverRole = accessControl.newRole({
        user: ["get"],
        session: ["list", "revoke"],
        booking: ["read", "list"],
    });

    adminRole = accessControl.newRole({
        user: ["create", "list", "get", "update", "delete", "set-role"],
        session: ["list", "revoke"],
        booking: ["create", "read", "list", "update", "cancel"],
    });

    defaultRoles = {
        passenger: passengerRole,
        driver: driverRole,
        admin: adminRole,
    };
};

const initialized = <T>(value: T | undefined, name: string): T => {
    if (!value) {
        throw new Error(`RBAC is not initialized: initAuth() must run before ${name} is read`);
    }
    return value;
};

export const getAccessControl = () => initialized(accessControl, "accessControl");
export const getDefaultRoles = () => initialized(defaultRoles, "defaultRoles");
export const getPassengerRole = () => initialized(passengerRole, "passengerRole");
export const getDriverRole = () => initialized(driverRole, "driverRole");
export const getAdminRole = () => initialized(adminRole, "adminRole");

export const DEFAULT_ROLE = "passenger";
export const ADMIN_ROLES = ["admin"];
