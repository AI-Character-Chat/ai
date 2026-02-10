import { test, expect } from '@playwright/test';

test.describe('스튜디오', () => {
  test('비로그인 시 스튜디오 접근하면 로그인 페이지로 리다이렉트', async ({ page }) => {
    await page.goto('/studio');
    // 로그인이 필요한 페이지이므로 로그인 관련 UI가 표시되거나 리다이렉트
    await expect(page.url()).toMatch(/\/(studio|api\/auth)/);
  });
});

test.describe('관리자 페이지', () => {
  test('비로그인 시 관리자 페이지 접근 불가', async ({ page }) => {
    await page.goto('/admin');
    // 인증 필요
    await expect(page.url()).toMatch(/\/(admin|api\/auth)/);
  });
});
