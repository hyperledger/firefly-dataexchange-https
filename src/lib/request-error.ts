import { NextFunction, Request, Response } from 'express';

export default class RequestError extends Error {

  details?: object;
  responseCode: number;

  constructor(message: string, responseCode = 500, details?: any) {
    super(message);
    this.details = details;
    this.responseCode = responseCode;
  }

}

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if(err instanceof RequestError) {
    res.status(err.responseCode).send({error: err.message, details: err.details});
  } else {
    res.status(500).send({ error: err.message });
  }
};