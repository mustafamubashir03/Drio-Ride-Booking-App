import { createAccessControl } from "better-auth/plugins";

export const statements = {
    user: ["create", "list", "get", "update", "delete", "set-role"],
    session: ["list", "revoke"],
    booking: ["create", "read", "list", "update", "cancel"],
} as const;

export const accessControl = createAccessControl(statements);

export const passengerRole = accessControl.newRole({
    user: ["get"],
    session: ["list", "revoke"],
    booking: ["create", "read", "list", "cancel"],
});

export const driverRole = accessControl.newRole({
    user: ["get"],
    session: ["list", "revoke"],
    booking: ["read", "list"],
});

export const adminRole = accessControl.newRole({
    user: ["create", "list", "get", "update", "delete", "set-role"],
    session: ["list", "revoke"],
    booking: ["create", "read", "list", "update", "cancel"],
});

export const defaultRoles = {
    passenger: passengerRole,
    driver: driverRole,
    admin: adminRole,
};

export const DEFAULT_ROLE = "passenger";
export const ADMIN_ROLES = ["admin"];