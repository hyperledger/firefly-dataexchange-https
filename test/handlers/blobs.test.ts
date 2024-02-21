// Copyright © 2024 Kaleido, Inc.
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

import stream from 'stream';
import { expect } from 'chai';
import * as blobs from '../../src/handlers/blobs';

const SAMPLE_TEXT_FILE_CONTENTS = 'This is the contents of the sample file';
const SAMPLE_TEXT_FILE_CONTENTS_HASH = '4791654392ed1850e18b594c5731187802451a16f5beeaad19f5efcb708b082a';
const SAMPLE_TEXT_FILE_PATH = '/other/my_test.txt';

describe('blobs', () => {

  it('Store blob', async () => {
    let readableStream = new stream.PassThrough();
    readableStream.write(SAMPLE_TEXT_FILE_CONTENTS);
    readableStream.end();
    const metadata = await blobs.storeBlob({
      key: 'file',
      name: 'test.txt',
      readableStream
    }, SAMPLE_TEXT_FILE_PATH);
    expect(metadata.hash).to.equal(SAMPLE_TEXT_FILE_CONTENTS_HASH);
    expect(metadata.size).to.equal(SAMPLE_TEXT_FILE_CONTENTS.length);
  });

  it('Retreive blob', async () => {
    const readStream = await blobs.retrieveBlob(SAMPLE_TEXT_FILE_PATH);
    await new Promise<void>(resolve => {
      let contents = '';
      readStream.on('data', data => {
        contents += data;
      }).on('end', () => {
        expect(contents).to.equal(SAMPLE_TEXT_FILE_CONTENTS);
        resolve();
      });
    });
  });

  it('Retreive blob metadata', async () => {
    const metadata = await blobs.retrieveMetadata(SAMPLE_TEXT_FILE_PATH);
    expect(metadata.hash).to.equal(SAMPLE_TEXT_FILE_CONTENTS_HASH);
    expect(metadata.size).to.equal(SAMPLE_TEXT_FILE_CONTENTS.length);
  });

  it('Delete blob', async () => {
    await blobs.deleteBlob(SAMPLE_TEXT_FILE_PATH);
  });

  it('Should not return deleted blob', async () => {
    let exceptionHandled = false;
    try {
      await blobs.retrieveBlob(SAMPLE_TEXT_FILE_PATH);
    } catch (err: any) {
      expect(err.responseCode).to.equal(404);
      exceptionHandled = true;
    }
    expect(exceptionHandled).to.equal(true);
  });

  it('Should not return deleted blob metadata', async () => {
    let exceptionHandled = false;
    try {
      await blobs.retrieveMetadata(SAMPLE_TEXT_FILE_PATH);
    } catch (err: any) {
      expect(err.responseCode).to.equal(404);
      exceptionHandled = true;
    }
    expect(exceptionHandled).to.equal(true);
  });

});
