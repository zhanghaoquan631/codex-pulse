import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatGPTSignInPath, chatGPTSignOutPath } from '../apps/account/src/chatgpt-auth.mjs'

test('auth return paths reject external navigation and reserved-route loops', () => {
  for (const helper of [chatGPTSignInPath, chatGPTSignOutPath]) {
    for (const value of ['https://outside.invalid/', '//outside.invalid/', '/\\outside.invalid/', '/signin-with-chatgpt', '/signout-with-chatgpt?return_to=/', '/callback', '/a/../callback', 'javascript:alert(1)', null]) {
      const result = new URL(helper(value), 'https://site.invalid')
      assert.equal(result.searchParams.get('return_to'), '/', String(value))
    }
    const result = new URL(helper('/account/?auth=changed#login'), 'https://site.invalid')
    assert.equal(result.searchParams.get('return_to'), '/account/?auth=changed#login')
  }
})
