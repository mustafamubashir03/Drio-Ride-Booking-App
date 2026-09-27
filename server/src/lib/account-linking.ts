/**
 * Account-linking security invariant.
 *
 * Better Auth promotes an existing local account to `emailVerified: true` when a
 * social identity proves the same address, but leaves the local `credential`
 * account in place. An unverified row carries no proof of who owns it, so a
 * password registered against it before the promotion was never proven to belong
 * to the mailbox owner - and once the row is promoted that password starts
 * working. That is an account-takeover path.
 *
 * Invariant: when an unverified local account is promoted through a verified
 * external identity, its unproven credential must not survive the promotion.
 *
 * Ordering (verified against better-auth 1.7.5, not assumed): `linkAccount()`
 * calls `createAccount()`, so this hook runs while the user is still
 * `emailVerified: false`; the promotion and the new session happen afterwards.
 * Deleting here therefore cannot remove the Google account or the session about
 * to be issued, and the Google account is preserved by the `providerId`
 * predicate rather than by timing.
 *
 * Scope: only `providerId === "credential"` rows, only for the exact user id on
 * the account being linked. Verified local accounts, brand-new social
 * registrations and the email-verification promotion path are untouched - the
 * last never creates an account, so this hook cannot fire for it.
 *
 * Fail-closed: an error propagates and fails the callback rather than completing
 * a promotion whose unproven credential could not be removed.
 */
import logger from "../config/logger.config";

type AccountRecord = {
    id: string;
    userId: string;
    providerId: string;
};

type InternalAdapter = {
    findUserById: (userId: string) => Promise<{ emailVerified?: boolean } | null>;
    findAccounts: (userId: string) => Promise<{ id: string; providerId: string }[]>;
    deleteAccount: (id: string) => Promise<unknown>;
    deleteUserSessions: (userId: string) => Promise<unknown>;
};

type HookContext = {
    context?: { internalAdapter?: InternalAdapter };
};

const CREDENTIAL_PROVIDER_ID = "credential";

export const revokeUnprovenCredentialOnSocialLink = async (
    account: AccountRecord,
    ctx?: HookContext | null
) => {
    // The local password account being registered: nothing to do.
    if (!account?.userId || account.providerId === CREDENTIAL_PROVIDER_ID) return;

    const internalAdapter = ctx?.context?.internalAdapter;
    if (!internalAdapter) return;

    // Already proven, or a brand-new social registration created verified.
    const user = await internalAdapter.findUserById(account.userId);
    if (!user || user.emailVerified === true) return;

    // Enumerated by providerId rather than via findCredentialAccount, which also
    // requires accountId === userId. A credential row that does not follow that
    // convention (legacy data, another provisioning path) would be skipped and
    // the unproven password would survive the promotion.
    const credentials = (await internalAdapter.findAccounts(account.userId))
        .filter((a) => a.providerId === CREDENTIAL_PROVIDER_ID && a.id !== account.id);
    if (credentials.length === 0) return;

    for (const credential of credentials) {
        await internalAdapter.deleteAccount(credential.id);
    }
    // Any session that existed while the account was unproven is dropped. The
    // session this callback is about to issue is created after this hook runs.
    await internalAdapter.deleteUserSessions(account.userId);

    logger.info("Removed unproven local credential after social-account promotion", {
        userId: account.userId,
        removedCount: credentials.length,
        linkedProviderId: account.providerId,
    });
};
