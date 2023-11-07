import { LoadedStrapi } from '@strapi/types';
import './resources/types/components.d.ts';
import './resources/types/contentTypes.d.ts';
import resources from './resources/index';
import { createTestSetup, destroyTestSetup } from '../../../utils/builder-helper';
import { testInTransaction } from '../../../utils/index';

const ARTICLE_UID = 'api::article.article';

const findArticleDb = async (where: any) => {
  return await strapi.query(ARTICLE_UID).findOne({ where });
};

const findArticlesDb = async (where: any) => {
  return await strapi.query(ARTICLE_UID).findMany({ where });
};

describe('Document Service', () => {
  let testUtils;
  let strapi: LoadedStrapi;

  beforeAll(async () => {
    testUtils = await createTestSetup(resources);
    strapi = testUtils.strapi;
  });

  afterAll(async () => {
    await destroyTestSetup(testUtils);
  });

  describe('Update', () => {
    it(
      'update a document',
      testInTransaction(async () => {
        const articleDb = await findArticleDb({ title: '3 Document A' });
        const newName = 'Updated Document';

        const article = await strapi.documents.update(ARTICLE_UID, articleDb.documentId, {
          data: { title: newName },
        });

        // verify that the returned document was updated
        expect(article).toMatchObject({
          ...articleDb,
          title: newName,
          updatedAt: article.updatedAt,
        });

        // verify it was updated in the database
        const updatedArticleDb = await findArticleDb({ title: newName });
        expect(updatedArticleDb).toMatchObject({
          ...articleDb,
          title: newName,
          updatedAt: article.updatedAt,
        });
      })
    );

    it.only(
      'update a document with locale and status',
      testInTransaction(async () => {
        const articleDb = await findArticleDb({ title: 'Article1-Draft-FR' });
        const newName = 'updated document';

        const article = await strapi.documents.update(ARTICLE_UID, articleDb.documentId, {
          data: { title: newName, locale: 'fr' },
        });

        // verify that the returned document was updated
        expect(article).toMatchObject({
          ...articleDb,
          title: newName,
          updatedAt: article.updatedAt,
        });

        // verify it was updated in the database
        const updatedArticleDb = await findArticleDb({ title: newName });
        expect(updatedArticleDb).toMatchObject({
          ...articleDb,
          title: newName,
          updatedAt: article.updatedAt,
        });

        // verity others locales are not updated
        const enLocale = await findArticleDb({ title: 'Article1' });
        expect(enLocale).toBeDefined();
      })
    );

    it.skip(
      'can not update published document',
      testInTransaction(async () => {
        const articleDb = await findArticleDb({ title: 'Article1-Draft-FR' });
        const newName = 'updated document';

        const article = await strapi.documents(ARTICLE_UID).update(articleDb.documentId, {
          // NOTE: Should this be inside data? Feels off
          data: { title: newName, status: 'published', locale: 'fr' },
        });
      })
    );

    it(
      'document to update does not exist',
      testInTransaction(async () => {
        const article = await strapi.documents.update(ARTICLE_UID, 'does-not-exist', {
          data: { title: 'updated document' },
        });

        expect(article).toBeNull();
      })
    );
  });
});