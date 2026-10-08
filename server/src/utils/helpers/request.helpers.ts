import { AsyncLocalStorage } from "async_hooks";

type AsyncLocalStorageType = {
    correlationId: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<AsyncLocalStorageType>(); // Created an instance of AsyncLocalStorage


export const getCorrelationId = () => {
    const asyncStore = asyncLocalStorage.getStore();
    // Logs emitted outside an HTTP request — startup, Redis connect, the
    // background search sweeper, Socket.IO handlers — have no async store. The
    // previous sentinel read as "an error occurred while creating a
    // correlation id", which is false and buried real dispatch logs under a
    // scary-looking message on every single line.
    return asyncStore?.correlationId || "no-request-context";
}
