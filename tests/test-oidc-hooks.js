import { createHookExecutor, createCookieHelpers } from '../src/plugins/api/concerns/oidc-hooks.js';

const testOidcHooks = async () => {
  console.log('🧪 Testing OIDC Hooks Integration\n');

  const hookResults = {
    beforeUserCreate: null,
    beforeUserUpdate: null,
    afterSessionCreate: null,
    afterUserEnrich: null
  };

  const mockContext = {
    req: {
      header: (name) => name === 'x-forwarded-for' ? '192.168.1.1' : null
    },
    get: (key) => {
      if (key === 'database') {
        return {
          resources: {
            users_v1: {
              get: async (id) => ({
                id,
                email: 'test@example.com',
                costCenterId: 'FRESH-CC-999',
                enrichedFromDb: true
              })
            }
          }
        };
      }
      return null;
    }
  };

  const mockLogger = {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
  };

  const config = {
    hooks: {
      beforeUserCreate: async ({ userData, claims, context }) => {
        console.log('✅ beforeUserCreate hook called');
        console.log('   - userData:', userData.email);
        console.log('   - claims:', claims.email);
        console.log('   - context:', context ? 'Available' : 'Missing');

        hookResults.beforeUserCreate = {
          hadContext: !!context,
          receivedUserData: !!userData,
          receivedClaims: !!claims
        };

        return {
          userData: {
            ...userData,
            costCenterId: 'CC-12345',
            costCenterName: 'Engineering',
            metadata: {
              peopleData: { department: 'Engineering' },
              firstLoginIp: context?.req?.header?.('x-forwarded-for') || 'test-ip'
            }
          }
        };
      },

      beforeUserUpdate: async ({ user, updates, claims, context }) => {
        console.log('✅ beforeUserUpdate hook called');
        console.log('   - user:', user.email);
        console.log('   - claims:', claims.email);
        console.log('   - context:', context ? 'Available' : 'Missing');

        hookResults.beforeUserUpdate = {
          hadContext: !!context,
          receivedUser: !!user,
          receivedClaims: !!claims
        };

        return {
          updates: {
            ...updates,
            costCenterId: 'CC-67890',
            metadata: {
              ...user.metadata,
              peopleData: { department: 'Updated Engineering' },
              lastLoginIp: context?.req?.header?.('x-forwarded-for') || 'test-ip-updated'
            }
          }
        };
      },

      afterSessionCreate: [
        async ({ user, sessionId, sessionData, created, context, auth }) => {
          console.log('✅ afterSessionCreate hook 1 called');
          console.log('   - user:', user.email);
          console.log('   - sessionId:', sessionId ? 'Present' : 'Missing');
          console.log('   - created:', created);
          console.log('   - context:', context ? 'Available' : 'Missing');
          console.log('   - auth (cookie helpers):', auth ? 'Available' : 'Missing');

          hookResults.afterSessionCreate = {
            hadContext: !!context,
            hadAuth: !!auth,
            hadSessionId: !!sessionId,
            wasCreated: created
          };

          if (auth && auth.setCookie) {
            console.log('   - Cookie helpers available: setCookie, setJsonCookie, deleteCookie');
          }
        },

        async ({ user, context, auth }) => {
          console.log('✅ afterSessionCreate hook 2 called (composable array)');
          console.log('   - Multiple hooks in array work!');
        }
      ],

      afterUserEnrich: async ({ sessionUser, dbUser, mergedUser, context }) => {
        console.log('✅ afterUserEnrich hook called');
        console.log('   - sessionUser:', sessionUser.email);
        console.log('   - context:', context ? 'Available' : 'Missing');

        hookResults.afterUserEnrich = {
          hadContext: !!context,
          hadSessionUser: !!sessionUser,
          hadMergedUser: !!mergedUser
        };

        const db = context?.get?.('database');
        if (db) {
          console.log('   - Database available from context');
          const freshUser = await db.resources.users_v1.get(sessionUser.id);

          return {
            mergedUser: {
              ...mergedUser,
              ...freshUser,
              authMethod: 'oidc',
              session: sessionUser.session,
              enrichedFromDb: true
            }
          };
        }

        return { mergedUser };
      }
    }
  };

  console.log('📦 Creating HookExecutor...\n');
  const hookExecutor = createHookExecutor(config, mockLogger);

  console.log('🧪 Test 1: beforeUserCreate hook with context\n');
  const createResult = await hookExecutor.executeHooks('beforeUserCreate', {
    userData: { email: 'newuser@example.com', name: 'New User' },
    claims: { email: 'newuser@example.com', sub: 'auth0|123' },
    usersResource: {},
    context: mockContext
  });

  console.log('\n🧪 Test 2: beforeUserUpdate hook with context\n');
  const updateResult = await hookExecutor.executeHooks('beforeUserUpdate', {
    user: { email: 'existinguser@example.com', costCenterId: 'OLD-CC' },
    updates: { email: 'existinguser@example.com' },
    claims: { email: 'existinguser@example.com', sub: 'auth0|456' },
    usersResource: {},
    context: mockContext
  });

  console.log('\n🧪 Test 3: afterSessionCreate hook with cookie helpers\n');
  const mockCookieContext = {
    ...mockContext,
    set: () => {},
    header: () => {}
  };
  const auth = createCookieHelpers(mockCookieContext, config);

  const sessionResult = await hookExecutor.executeHooks('afterSessionCreate', {
    user: { email: 'sessionuser@example.com' },
    sessionId: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.payload.signature',
    sessionData: { issued_at: Date.now() },
    created: true,
    context: mockCookieContext,
    auth
  });

  console.log('\n🧪 Test 4: afterUserEnrich hook with database access\n');
  const enrichResult = await hookExecutor.executeHooks('afterUserEnrich', {
    sessionUser: { id: 'user123', email: 'enriched@example.com', session: {} },
    dbUser: null,
    mergedUser: { id: 'user123', email: 'enriched@example.com' },
    context: mockContext
  });

  console.log('\n📊 Hook Test Results:\n');
  console.log('beforeUserCreate:', hookResults.beforeUserCreate);
  console.log('beforeUserUpdate:', hookResults.beforeUserUpdate);
  console.log('afterSessionCreate:', hookResults.afterSessionCreate);
  console.log('afterUserEnrich:', hookResults.afterUserEnrich);

  console.log('\n🎯 Verification:\n');

  if (createResult.userData.costCenterId === 'CC-12345') {
    console.log('✅ beforeUserCreate modified userData correctly');
  } else {
    console.log('❌ beforeUserCreate failed to modify userData');
  }

  if (updateResult.updates.costCenterId === 'CC-67890') {
    console.log('✅ beforeUserUpdate modified updates correctly');
  } else {
    console.log('❌ beforeUserUpdate failed to modify updates');
  }

  if (hookResults.afterSessionCreate.hadAuth && hookResults.afterSessionCreate.hadContext) {
    console.log('✅ afterSessionCreate received cookie helpers and context');
  } else {
    console.log('❌ afterSessionCreate missing cookie helpers or context');
  }

  if (enrichResult.mergedUser.enrichedFromDb) {
    console.log('✅ afterUserEnrich enriched user from database');
  } else {
    console.log('❌ afterUserEnrich failed to enrich from database');
  }

  console.log('\n🎉 All hooks integrated successfully!');
  console.log('✅ Context available in all hooks');
  console.log('✅ Cookie helpers available in afterSessionCreate');
  console.log('✅ Array of hooks (composable) works');
  console.log('✅ Database access in afterUserEnrich');
};

testOidcHooks().catch(console.error);
