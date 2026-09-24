import { RoleModel } from "../models";
import { UserModel } from "../models";
import logger from "../config/logger.config";
import { defaultRoles } from "./rbac";

const roleDefinitions: Record<string, { description: string; resources: Record<string, readonly string[]> }> = {
    passenger: {
        description: "Default role assigned on signup. Can book, read and cancel their own rides.",
        resources: {
            user: ["get"],
            session: ["list", "revoke"],
            booking: ["create", "read", "list", "cancel", "review"],
        },
    },
    driver: {
        description: "Ride provider. Can list and accept ride requests.",
        resources: {
            user: ["get"],
            session: ["list", "revoke"],
            booking: ["read", "list"],
        },
    },
    admin: {
        description: "Full platform access. Manages users, sessions and bookings.",
        resources: {
            user: ["create", "list", "get", "update", "delete", "set-role"],
            session: ["list", "revoke"],
            booking: ["create", "read", "list", "update", "cancel", "review"],
        },
    },
};

const toPermissionStrings = (resources: Record<string, readonly string[]>): string[] =>
    Object.entries(resources).flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}`));

export async function seedRbacRoles() {
    for (const [name, def] of Object.entries(roleDefinitions)) {
        await RoleModel.updateOne(
            { name },
            {
                $set: {
                    description: def.description,
                    permissions: toPermissionStrings(def.resources),
                    isSystem: true,
                },
            },
            { upsert: true }
        );
    }
    logger.info("RBAC roles seeded", { roles: Object.keys(roleDefinitions) });
}

// Backfill users created before roles existed: default to passenger, promote
// configured admins, and demote anyone else holding admin.
export async function backfillUserRoles() {
    const adminEmails = (process.env.DRIO_ADMIN_EMAILS || "mustafamubashir87@gmail.com")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

    const { modifiedCount } = await UserModel.updateMany(
        { role: { $exists: false } },
        { $set: { role: "passenger" } }
    );

    let promotedCount = 0;
    for (const email of adminEmails) {
        const res = await UserModel.updateOne({ email }, { $set: { role: "admin" } });
        if (res.modifiedCount > 0) promotedCount += res.modifiedCount;
    }

    const adminPatterns = adminEmails.map(
        (email) => new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    );
    const { modifiedCount: demotedCount } = await UserModel.updateMany(
        { role: "admin", $nor: adminPatterns.map((pattern) => ({ email: pattern })) },
        { $set: { role: "passenger" } }
    );

    logger.info("Backfilled user roles", {
        defaulted: modifiedCount,
        promoted: promotedCount,
        demoted: demotedCount,
        adminEmails,
    });
}

export async function seedRbac() {
    await seedRbacRoles();
    await backfillUserRoles();
}

export { defaultRoles, roleDefinitions };