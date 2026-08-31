import {
  type AsyncThunkPayloadCreator,
  createAsyncThunk,
} from "@reduxjs/toolkit";
import { ApiClientError } from "@/api";
import type { AppState } from "@/types";

/**
 * The `rejectWithValue` payload every thunk in this folder rejects with.
 *
 * `statusCode` is present when the failure came back from the API with one. It
 * exists because some HTTP answers are not just text to show the user: a 409
 * from the save route means "someone wrote first", which the editor has to
 * handle differently from a server that is merely unhappy.
 */
export type Failure = {
  title: string;
  subtitle: string;
  statusCode?: number;
};

const DEFAULT_TITLE = "Something went wrong";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

/**
 * An expected non-result — a missing record, a server saying no — as opposed to
 * a thrown bug. Carried as an exception only so a thunk body can bail from a
 * nested position; `createApiThunk` unwraps it into the same `Failure` payload
 * an ordinary throw produces, minus the `console.error`.
 */
export class ThunkFailure extends Error {
  constructor(readonly subtitle: string, readonly title?: string) {
    super(subtitle);
    this.name = "ThunkFailure";
  }
}

/**
 * Reject the surrounding thunk with `subtitle`, quietly.
 *
 * `title` defaults to the thunk's own (see `createApiThunk`'s `title` option),
 * so a route with its own heading — "Export failed" — keeps it here too.
 */
export function fail(subtitle: string, title?: string): never {
  throw new ThunkFailure(subtitle, title);
}

interface ApiThunkConfig {
  state: AppState;
  rejectValue: Failure;
}

type ApiThunkAPI = Parameters<
  AsyncThunkPayloadCreator<unknown, unknown, ApiThunkConfig>
>[1];

interface ApiThunkOptions {
  /** Heading for the failure announcement. Defaults to "Something went wrong". */
  title?: string;
  /** Prefix for the console.error, for thunks whose failures are hard to place. */
  logLabel?: string;
}

/**
 * `createAsyncThunk` with this app's error contract applied once.
 *
 * The body returns its value and throws to fail; an unexpected throw is logged
 * and becomes `{ title, subtitle }`, and `fail()` produces the same payload for
 * outcomes that are not bugs. Callers still see a plain rejected thunk, so
 * `.rejected.match(result)` and `.unwrap()` behave as before.
 */
export function createApiThunk<Returned, ThunkArg = void>(
  typePrefix: string,
  body: (arg: ThunkArg, thunkAPI: ApiThunkAPI) => Promise<Returned>,
  options: ApiThunkOptions = {},
) {
  const { title = DEFAULT_TITLE, logLabel } = options;
  return createAsyncThunk<Returned, ThunkArg, ApiThunkConfig>(
    typePrefix,
    async (arg, thunkAPI) => {
      try {
        return await body(arg, thunkAPI);
      } catch (error: unknown) {
        if (error instanceof ThunkFailure) {
          return thunkAPI.rejectWithValue({
            title: error.title ?? title,
            subtitle: error.subtitle,
          });
        }
        if (logLabel) console.error(logLabel, error);
        else console.error(error);
        return thunkAPI.rejectWithValue({
          title,
          // `message` is already "Title: Subtitle" from the API envelope, so the
          // server's own wording survives; the status code is what would
          // otherwise be lost here.
          subtitle: toErrorMessage(error),
          ...(error instanceof ApiClientError && error.statusCode !== undefined
            ? { statusCode: error.statusCode }
            : {}),
        });
      }
    },
  );
}
