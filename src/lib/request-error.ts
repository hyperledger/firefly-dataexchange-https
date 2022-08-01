// Copyright © 2022 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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