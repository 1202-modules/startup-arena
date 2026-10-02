export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "SESSION_NOT_FOUND"
  | "INVALID_STATE"
  | "EVENT_FINALIZED"
  | "SESSION_ALREADY_ACTIVE"
  | "DUPLICATE_NAME"
  | "INVALID_ORGANIZER_PASSWORD"
  | "ORGANIZER_AUTH_REQUIRED"
  | "ORGANIZER_PASSWORD_NOT_CONFIGURED";

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 503,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function validationError(message = "The request is invalid."): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message);
}

export function sessionNotFound(): ApiError {
  return new ApiError(404, "SESSION_NOT_FOUND", "Session was not found.");
}

export function invalidState(message = "This action is not available in the current game state."): ApiError {
  return new ApiError(409, "INVALID_STATE", message);
}

export function eventFinalized(): ApiError {
  return new ApiError(409, "EVENT_FINALIZED", "This event has already ended.");
}
