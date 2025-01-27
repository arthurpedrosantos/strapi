import { ObjectCannedACL } from '@aws-sdk/client-s3';
import type { InitOptions } from '..';
import { extractCredentials } from '../utils';

const accessKeyId = 'AWS_ACCESS_KEY_ID';
const secretAccessKey = 'AWS_ACCESS_SECRET';

const defaultOptions = {
  region: 'AWS_REGION',
  params: {
    ACL: ObjectCannedACL.public_read,
    signedUrlExpires: 111111111111,
    Bucket: 'AWS_BUCKET',
  },
};

describe('Utils', () => {
  describe('Extract credentials for V4 different aws provider configurations', () => {
    test('[Legacy] Credentials directly in the options', async () => {
      const options: InitOptions = {
        accessKeyId,
        secretAccessKey,
        ...defaultOptions,
      };
      const credentials = extractCredentials(options);

      expect(credentials).toEqual({
        accessKeyId,
        secretAccessKey,
      });
    });

    test('[Legacy] credentials directly in s3Options', async () => {
      const options: InitOptions = {
        s3Options: {
          accessKeyId,
          secretAccessKey,
          ...defaultOptions,
        },
      };
      const credentials = extractCredentials(options);

      expect(credentials).toEqual({
        accessKeyId,
        secretAccessKey,
      });
    });

    test('Credentials in credentials object inside s3Options', async () => {
      const options: InitOptions = {
        s3Options: {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          ...defaultOptions,
        },
      };
      const credentials = extractCredentials(options);

      expect(credentials).toEqual({
        accessKeyId,
        secretAccessKey,
      });
    });
  });
});
