import { join } from 'path';
import { promises as fs } from 'fs';
import moment from 'moment';
import * as chai from 'chai';
import { expect }from 'chai';
import { KEYUTIL, KJUR } from 'jsrsasign';
import { stub } from 'sinon';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);

// Set sandbox dir as config before initializing utils
const sandboxDir = join(__dirname, 'resources', 'sandbox');
process.env.DATA_DIRECTORY = sandboxDir;

import * as app from '../src/app';

describe('app', () => {

  beforeEach(async () => {
    if ((await fs.stat(sandboxDir)).isDirectory()) {
      await fs.rm(sandboxDir, { recursive: true, force: true})
    }
    await fs.mkdir(sandboxDir)
    await fs.mkdir(join(sandboxDir, 'peer-certs'))

    const start = moment().utc().subtract(1, 'minute');
    const end = moment(start).add(12, 'months');
    const startUTC = start.format('YYYYMMDDHHmmss\\Z');
    const endUTC = end.format('YYYYMMDDHHmmss\\Z');
    const keypair = KEYUTIL.generateKeypair('EC', 'secp256r1');
    const keyPEM = KEYUTIL.getPEM(keypair.prvKeyObj, "PKCS8PRV")
    const certPEM = KJUR.asn1.x509.X509Util.newCertPEM({
      serial: { int: 4 },
      sigalg: { name: "SHA256withECDSA" },
      issuer: { str: "/C=US/O=a" },
      notbefore: { str: startUTC },
      notafter: { str: endUTC },
      subject: { str: "/C=US/O=b" },
      sbjpubkey: keypair.pubKeyObj,
      sbjprvkey: keypair.prvKeyObj,
      cakey: keypair.prvKeyObj,
    } as any);
    await fs.writeFile(join(sandboxDir, 'key.pem'), keyPEM);
    await fs.writeFile(join(sandboxDir, 'cert.pem'), certPEM);

    await fs.writeFile(join(sandboxDir, 'config.json'), JSON.stringify({
      api: {
        hostname: "localhost",
        port: 10101,
      },
      p2p: {
        hostname: "localhost",
        port: 10102,
      }
    }, null, 2));

    stub(process, 'exit');
  });

  afterEach(() => {
    (process.exit as any).restore();
  })
  
  it('starts and stops', async () => {

    await app.start();
    await app.stop();

    expect(process.exit).to.be.called;

  })

})