import { HttpException, HttpStatus } from "@nestjs/common";

/** Erro de regra de negócio (422). Mensagem segura para exibir ao usuário. */
export class DomainError extends HttpException {
  constructor(message: string, code = "DomainError") {
    super({ message, error: code }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** Recurso não encontrado dentro do escopo do household (404). */
export class NotFoundError extends HttpException {
  constructor(resource: string) {
    super({ message: `${resource} não encontrado`, error: "NotFound" }, HttpStatus.NOT_FOUND);
  }
}

/** Conflito de unicidade / estado (409). */
export class ConflictError extends HttpException {
  constructor(message: string) {
    super({ message, error: "Conflict" }, HttpStatus.CONFLICT);
  }
}

/** Dependência externa fora do ar (503). Mensagem segura para exibir ao usuário. */
export class ServiceUnavailableError extends HttpException {
  constructor(message: string, code = "ServiceUnavailable") {
    super({ message, error: code }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
