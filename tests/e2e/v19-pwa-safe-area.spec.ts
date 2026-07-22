import { expect, test } from "@playwright/test";

const NON_ZERO_INSETS = {
  bottom: 29,
  left: 23,
  right: 27,
  top: 31,
} as const;

test.use({ viewport: { height: 844, width: 390 } });

test("PWA fullscreen surfaces reserve one non-zero safe-area owner per edge", async ({
  context,
  page,
}) => {
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("Emulation.setSafeAreaInsetsOverride", {
    insets: NON_ZERO_INSETS,
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.all(
      [
        "/src/shared/ui/review-workspace.css",
        "/src/modules/submissions/components/questionnaire-codex-polish-v1.css",
      ].map(
        (href) =>
          new Promise<void>((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener(
              "error",
              () => reject(new Error(`Unable to load product stylesheet ${href}`)),
              { once: true },
            );
            document.head.append(link);
          }),
      ),
    );
  });

  const measurements = await page.evaluate(() => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("Missing application root");
    }

    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <section class="admin-passport-workspace" data-safe-area-surface="admin-passport" style="position: fixed; inset: 0">
        <footer class="admin-passport-workspace-footer" data-safe-area-bottom-owner="admin-passport"></footer>
      </section>
      <section class="v19-review-workspace" data-safe-area-surface="review" style="position: fixed; inset: 0">
        <footer class="v19-review-decision" data-safe-area-bottom-owner="review"></footer>
      </section>
      <section class="vf-figma-questionnaire-screen codex-polish-v1 v19-questionnaire-screen-shell" data-safe-area-surface="questionnaire" style="position: fixed; inset: 0">
        <footer class="v19-questionnaire-mobile-footer" data-safe-area-bottom-owner="questionnaire"></footer>
      </section>
      <section class="v19-preupload-screen" data-safe-area-surface="create" style="position: fixed; inset: 0">
        <div class="v19-preupload-footer" data-safe-area-bottom-owner="create"></div>
      </section>
    `;
    root.append(fixture);

    function surfaceBox(name: string) {
      const selector = `[data-safe-area-surface="${name}"]`;
      const element = document.querySelector<HTMLElement>(selector);

      if (element === null) {
        throw new Error(`Missing safe-area fixture ${selector}`);
      }

      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();

      return {
        borderBottom: Number.parseFloat(style.borderBottomWidth),
        borderLeft: Number.parseFloat(style.borderLeftWidth),
        borderRight: Number.parseFloat(style.borderRightWidth),
        borderTop: Number.parseFloat(style.borderTopWidth),
        height: bounds.height,
        width: bounds.width,
      };
    }

    function bottomOwner(name: string) {
      const selector = `[data-safe-area-bottom-owner="${name}"]`;
      const element = document.querySelector<HTMLElement>(selector);

      if (element === null) {
        throw new Error(`Missing safe-area bottom owner ${selector}`);
      }

      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        left: bounds.left,
        paddingBottom: Number.parseFloat(style.paddingBottom),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
        rightGap: window.innerWidth - bounds.right,
      };
    }

    const rootStyle = getComputedStyle(root);

    return {
      bottomOwners: {
        adminPassport: bottomOwner("admin-passport"),
        create: bottomOwner("create"),
        questionnaire: bottomOwner("questionnaire"),
        review: bottomOwner("review"),
      },
      adminPassport: surfaceBox("admin-passport"),
      create: surfaceBox("create"),
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      questionnaire: surfaceBox("questionnaire"),
      review: surfaceBox("review"),
      root: {
        minHeight: Number.parseFloat(rootStyle.minHeight),
        paddingBottom: Number.parseFloat(rootStyle.paddingBottom),
        paddingLeft: Number.parseFloat(rootStyle.paddingLeft),
        paddingRight: Number.parseFloat(rootStyle.paddingRight),
        paddingTop: Number.parseFloat(rootStyle.paddingTop),
      },
    };
  });

  expect(measurements.root).toEqual({
    minHeight: measurements.innerHeight,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
  });

  for (const surface of [
    measurements.adminPassport,
    measurements.review,
    measurements.questionnaire,
    measurements.create,
  ]) {
    expect(surface).toEqual({
      borderBottom: 0,
      borderLeft: NON_ZERO_INSETS.left,
      borderRight: NON_ZERO_INSETS.right,
      borderTop: NON_ZERO_INSETS.top,
      height: measurements.innerHeight,
      width: measurements.innerWidth,
    });
  }

  expect(measurements.bottomOwners).toEqual({
    adminPassport: {
      left: 0,
      paddingBottom: NON_ZERO_INSETS.bottom,
      paddingLeft: NON_ZERO_INSETS.left,
      paddingRight: NON_ZERO_INSETS.right,
      rightGap: 0,
    },
    create: {
      left: NON_ZERO_INSETS.left,
      paddingBottom: NON_ZERO_INSETS.bottom,
      paddingLeft: 0,
      paddingRight: 0,
      rightGap: NON_ZERO_INSETS.right,
    },
    questionnaire: {
      left: NON_ZERO_INSETS.left,
      paddingBottom: NON_ZERO_INSETS.bottom,
      paddingLeft: 8,
      paddingRight: 8,
      rightGap: NON_ZERO_INSETS.right,
    },
    review: {
      left: 0,
      paddingBottom: NON_ZERO_INSETS.bottom,
      paddingLeft: NON_ZERO_INSETS.left,
      paddingRight: NON_ZERO_INSETS.right,
      rightGap: 0,
    },
  });
});

test("operational shell owns the left safe edge at the 1024px navigation breakpoint", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 768, width: 1024 });
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("Emulation.setSafeAreaInsetsOverride", {
    insets: NON_ZERO_INSETS,
  });
  await page.goto("/");

  const borders = await page.evaluate(() => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("Missing application root");
    }

    const shell = document.createElement("div");
    shell.className = "ops-shell has-unified-side-menu";
    shell.innerHTML = `
      <aside class="v19-ds-side-menu ops-sidebar opsu-sidebar" data-v19-component="side-menu" data-safe-area-sidebar></aside>
      <main class="workspace" data-safe-area-workspace></main>
    `;
    root.append(shell);

    const workspace = shell.querySelector<HTMLElement>("[data-safe-area-workspace]");

    const sidebar = shell.querySelector<HTMLElement>("[data-safe-area-sidebar]");

    if (workspace === null || sidebar === null) {
      throw new Error("Missing operational safe-area fixture");
    }

    const sidebarStyle = getComputedStyle(sidebar);
    const workspaceStyle = getComputedStyle(workspace);

    return {
      sidebar: {
        bottom: Number.parseFloat(sidebarStyle.borderBottomWidth),
        left: Number.parseFloat(sidebarStyle.borderLeftWidth),
        top: Number.parseFloat(sidebarStyle.borderTopWidth),
      },
      workspace: {
        left: Number.parseFloat(workspaceStyle.borderLeftWidth),
        right: Number.parseFloat(workspaceStyle.borderRightWidth),
        top: Number.parseFloat(workspaceStyle.borderTopWidth),
      },
    };
  });

  expect(borders).toEqual({
    sidebar: {
      bottom: NON_ZERO_INSETS.bottom,
      left: NON_ZERO_INSETS.left,
      top: NON_ZERO_INSETS.top,
    },
    workspace: {
      left: NON_ZERO_INSETS.left,
      right: NON_ZERO_INSETS.right,
      top: NON_ZERO_INSETS.top,
    },
  });
});
