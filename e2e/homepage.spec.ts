import { test, expect } from '@playwright/test';

test.describe('홈페이지', () => {
  test('페이지가 정상적으로 로드된다', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SYNK/);
  });

  test('SYNK 로고가 표시된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('SYNK').first()).toBeVisible();
  });

  test('검색 버튼이 작동한다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '검색' }).click();
    await expect(page.getByPlaceholder('작품, 캐릭터, 태그 검색...')).toBeVisible();
  });

  test('비로그인 상태에서 로그인 버튼이 표시된다', async ({ page }) => {
    await page.goto('/');
    const loginButton = page.getByText('로그인');
    await expect(loginButton).toBeVisible();
  });
});

test.describe('네비게이션', () => {
  test('사이드바 메뉴 토글이 작동한다', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: '사이드바 메뉴 열기' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
  });
});
