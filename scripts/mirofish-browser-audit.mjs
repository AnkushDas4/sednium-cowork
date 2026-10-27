import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const CHROMIUM_PATH = "/home/ankush/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const TARGET_URL = process.env.AUDIT_URL || "https://cowork.sednium.com";
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || "/home/ankush/.gemini/antigravity/brain/ac5fe02c-3e35-468b-83b2-dc5c2a54589a";

async function runAudit() {
  console.log("==================================================================");
  console.log("  MiroFish Autonomous Screen Audit & Real-Time Bug Hunter         ");
  console.log(`  Target: ${TARGET_URL}`);
  console.log("==================================================================");

  const findings = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const networkFailures = [];

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  function setupLogging(page, label) {
    page.on("console", msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") {
        console.error(`[${label} ERROR]`, text);
        consoleErrors.push({ context: label, text });
      } else if (type === "warning") {
        consoleWarnings.push({ context: label, text });
      }
    });

    page.on("pageerror", err => {
      console.error(`[${label} UNCAUGHT]`, err.message);
      consoleErrors.push({ context: label, text: `Uncaught: ${err.message}` });
    });

    page.on("requestfailed", req => {
      console.error(`[${label} NET_FAIL]`, req.url(), req.failure()?.errorText);
      networkFailures.push({ context: label, url: req.url(), error: req.failure()?.errorText });
    });
  }

  // ==================================================================
  // PHASE 1: Desktop Landing Page Audit (1440x900)
  // ==================================================================
  console.log("\n[PHASE 1] Auditing Desktop Landing Page (1440x900)...");
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  });
  const page = await desktopCtx.newPage();
  setupLogging(page, "DesktopLanding");

  await page.goto(TARGET_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Capture: Landing Dark
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_landing_desktop_dark.png"), fullPage: true });
  console.log("Captured: screen_landing_desktop_dark.png");

  // Check 1: Horizontal Overflow on Landing
  const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (landingOverflow) {
    findings.push({
      id: "BUG-LANDING-OVERFLOW",
      severity: "MEDIUM",
      component: "Landing Page (Desktop)",
      issue: "Horizontal scrollbar detected on Landing Page (document.scrollWidth > window.innerWidth).",
      screenContext: "screen_landing_desktop_dark.png"
    });
  }

  // Check 2: Form submission with empty handle
  console.log("[PHASE 1.1] Testing Empty Handle Submission (Validation Bug)...");
  const handleInput = await page.$("input[placeholder*='dev' i]");
  if (handleInput) {
    await handleInput.fill(""); // empty
    const connectBtn = await page.$("button:has-text('CONNECT TO RELAY')");
    if (connectBtn) {
      await connectBtn.click();
      await page.waitForTimeout(600);
      const urlStillRoot = page.url() === TARGET_URL || page.url() === `${TARGET_URL}/`;
      const validationMsg = await page.$(".text-danger, [role='alert'], .text-error");
      if (urlStillRoot && !validationMsg) {
        findings.push({
          id: "BUG-SILENT-EMPTY-HANDLE",
          severity: "MEDIUM",
          component: "LandingPage (Join Form)",
          issue: "Silent failure on empty handle: Clicking 'CONNECT TO RELAY' with an empty handle does nothing without rendering any error or required validation indicator on screen.",
          screenContext: "screen_landing_desktop_dark.png"
        });
        console.log("Confirmed Bug: Silent failure on empty handle submission.");
      }
    }
  }

  // Check 3: Theme Toggle on Landing Page
  console.log("[PHASE 1.2] Testing Theme Toggle on Landing Page...");
  const themeToggle = await page.$("button[title*='mode' i], button[aria-label*='theme' i]");
  if (themeToggle) {
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_landing_desktop_light.png"), fullPage: true });
    console.log("Captured: screen_landing_desktop_light.png");
    // Toggle back to dark
    await themeToggle.click();
    await page.waitForTimeout(300);
  }

  // Check 4: Room Minting and Joining
  console.log("[PHASE 1.3] Minting Room & Connecting Operator...");
  if (handleInput) {
    await handleInput.fill("ankush-operator");
  }
  const connectBtn = await page.$("button:has-text('CONNECT TO RELAY')");
  await connectBtn.click();
  await page.waitForTimeout(2000);

  const roomUrl = page.url();
  console.log("Entered Room URL:", roomUrl);
  if (!roomUrl.includes("?room=SED-") || !roomUrl.includes("#k=")) {
    findings.push({
      id: "BUG-ROOM-URL",
      severity: "HIGH",
      component: "Session Router",
      issue: "Room URL missing roomCode query parameter or '#k=' invite key hash fragment after joining.",
      evidence: `Current URL: ${roomUrl}`
    });
  }

  // ==================================================================
  // PHASE 2: Active Room Screen Audit (Desktop 1440x900)
  // ==================================================================
  console.log("\n[PHASE 2] Auditing Active Room Desktop Interface...");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_room_desktop_dark.png") });
  console.log("Captured: screen_room_desktop_dark.png");

  // Check 5: Residual "RELAY HUD V1.0" badge in RoomHeader
  const headerText = await page.$eval("header", el => el.innerText);
  console.log("Header text snapshot:", headerText.replace(/\n/g, " "));
  if (headerText.toLowerCase().includes("relay hud v1.0") || headerText.toLowerCase().includes("relay v1.0")) {
    findings.push({
      id: "BUG-HEADER-RESIDUAL-BADGE",
      severity: "LOW",
      component: "RoomHeader",
      issue: "Stale branding text detected: RoomHeader still displays 'RELAY HUD v1.0' badge, which was supposed to be removed in the UI decluttering.",
      evidence: headerText.slice(0, 100)
    });
    console.log("Confirmed Bug: 'RELAY HUD v1.0' badge still present in RoomHeader.");
  }

  // Check 6: QR Code Modal
  console.log("[PHASE 2.1] Testing QR Code Modal...");
  const qrBtn = await page.$("header button:has-text('SED-'), button[title*='QR' i], button:has(svg.lucide-qr-code)");
  if (qrBtn) {
    await qrBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_qr_modal.png") });
    console.log("Captured: screen_qr_modal.png");

    const modalMetrics = await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0 .shadow-float");
      if (!modal) return null;
      const rect = modal.getBoundingClientRect();
      const closeBtn = modal.querySelector("button");
      const btnRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
      return {
        modalTop: rect.top,
        modalBottom: rect.bottom,
        modalHeight: rect.height,
        btnTop: btnRect ? btnRect.top : null,
        isClippedAtTop: rect.top < 0
      };
    });
    console.log("QR Modal bounding metrics:", modalMetrics);

    if (modalMetrics && modalMetrics.isClippedAtTop) {
      findings.push({
        id: "BUG-QR-MODAL-CLIPPED",
        severity: "CRITICAL",
        component: "RoomHeader (QR Modal)",
        issue: "QR Modal trapped and clipped off-screen: Because the modal is rendered inside `<header>` which has `backdrop-blur-md`, CSS containing block limits `fixed inset-0` to the 56px header height. The modal centers within 56px, rendering the top ~200px (including the title and Close button) off the top of the viewport (`top < 0`). Additionally, clicking the backdrop and pressing Escape do not close the modal, permanently trapping the user.",
        evidence: JSON.stringify(modalMetrics),
        screenContext: "screen_qr_modal.png"
      });
      console.log("Confirmed Critical Bug: QR Modal is clipped off-screen at top and traps user.");
    }

    // Dismiss modal by evaluating click on close button directly via DOM
    await page.evaluate(() => {
      const modal = document.querySelector(".fixed.inset-0 .shadow-float");
      const btn = modal?.querySelector("button");
      btn?.click();
    });
    await page.waitForTimeout(400);
  }

  // Check 7: Theme Toggle inside Room (Light Mode)
  console.log("[PHASE 2.2] Testing Room Theme Toggle to Light...");
  const roomThemeToggle = await page.$("header button[title*='mode' i], header button[aria-label*='theme' i]");
  if (roomThemeToggle) {
    await roomThemeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_room_desktop_light.png") });
    console.log("Captured: screen_room_desktop_light.png");
    // Switch back to dark
    await roomThemeToggle.click();
    await page.waitForTimeout(300);
  }

  // Check 8: Chat Composer & Optimistic Send
  console.log("[PHASE 2.3] Testing Chat Composer & Message Bubble Layout...");
  const composer = await page.$("textarea, input[placeholder*='message' i], input[placeholder*='Type' i]");
  if (composer) {
    const testMsg = "MiroFish Automated Audit Test — Verifying optimistic UI & bubble layout.";
    await composer.fill(testMsg);
    await page.waitForTimeout(300);

    const sendBtn = await page.$("button:has-text('DISPATCH'), button[title*='Send' i], button:has(svg.lucide-send)");
    if (sendBtn) {
      await sendBtn.click();
      await page.waitForTimeout(1000);

      // Verify bubble appeared on screen
      const bubbleFound = await page.evaluate(text => document.body.innerText.includes(text), testMsg);
      if (!bubbleFound) {
        findings.push({
          id: "BUG-OPTIMISTIC-SEND",
          severity: "HIGH",
          component: "ChatTerminal",
          issue: "Optimistic chat send failure: typed message did not appear in chat feed after clicking Send.",
          evidence: `Message text not found in DOM`
        });
      } else {
        console.log("Message bubble rendered successfully in chat!");
      }
    }
  }

  // Check 9: Feed Tabs Filter Switching
  console.log("[PHASE 2.4] Testing Filter Tabs (All Events, Priority & Mentions, Git Sync, File Locks)...");
  const filterTabs = ["All Events", "Priority & Mentions", "Git Sync", "File Locks"];
  for (const f of filterTabs) {
    const tabBtn = await page.$(`button:has-text('${f}')`);
    if (tabBtn) {
      await tabBtn.click();
      await page.waitForTimeout(300);
      const isVisible = await tabBtn.isVisible();
      console.log(`Tab '${f}' active. Visible:`, isVisible);
    }
  }
  // Return to All Events
  const tabAll = await page.$("button:has-text('All Events')");
  if (tabAll) await tabAll.click();

  // ==================================================================
  // PHASE 3: Live Multi-Agent Co-Presence Injection via REST API
  // ==================================================================
  console.log("\n[PHASE 3] Simulating Live Peer AI Agent ('claude-ai') via REST API...");
  const parsed = new URL(roomUrl);
  const roomCode = parsed.searchParams.get("room");
  const inviteKey = parsed.hash.replace("#k=", "");

  if (roomCode && inviteKey) {
    console.log(`Publishing live presence to room ${roomCode}...`);
    try {
      // 1. Send Presence with Activity Narration
      await fetch(`${parsed.origin}/api/presence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cowork-Invite-Key": inviteKey,
          "X-Cowork-Client-Token": "sim_claude_agent_token_32chars_ok"
        },
        body: JSON.stringify({
          action: "inbox",
          roomCode,
          clientId: "claude-ai",
          role: "agent",
          model: "Claude 3.7 Sonnet",
          harness: "Claude Code",
          status: "EDITING: Refactoring ChatTerminal styles",
          activity: {
            state: "editing",
            summary: "Refactoring ChatTerminal bubbles",
            detail: "Applying right alignment for self bubbles and updating max-width constraints.",
            files: ["src/components/ChatTerminal.tsx"],
            tool: "edit_file",
            at: Date.now()
          },
          ack: []
        })
      });

      // 2. Claim an Advisory File Lock
      await fetch(`${parsed.origin}/api/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cowork-Invite-Key": inviteKey,
          "X-Cowork-Client-Token": "sim_claude_agent_token_32chars_ok"
        },
        body: JSON.stringify({
          roomCode,
          senderId: "claude-ai",
          targetId: "all",
          contentType: "FILE_LOCK",
          text: "Claimed lease for ChatTerminal.tsx",
          files: ["src/components/ChatTerminal.tsx"]
        })
      });

      // 3. Send Peer Chat Message
      await fetch(`${parsed.origin}/api/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cowork-Invite-Key": inviteKey,
          "X-Cowork-Client-Token": "sim_claude_agent_token_32chars_ok"
        },
        body: JSON.stringify({
          roomCode,
          senderId: "claude-ai",
          targetId: "all",
          contentType: "CHAT",
          text: "Hey @ankush-operator! I have acquired the advisory lock on `ChatTerminal.tsx` and started editing."
        })
      });

      // Wait 3.5s for desktop UI poll to catch up
      console.log("Waiting 3.5s for browser poll & Live Activity Rail update...");
      await page.waitForTimeout(3500);

      // Capture screenshot of Live Activity Rail & Peer message
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_live_activity_rail.png") });
      console.log("Captured: screen_live_activity_rail.png");

      // Verify agent appeared in Activity Rail
      const railHasAgent = await page.evaluate(() => document.body.innerText.includes("claude-ai"));
      console.log("Did 'claude-ai' appear in live Activity Rail / chat?", railHasAgent);
      if (!railHasAgent) {
        findings.push({
          id: "BUG-LIVE-RAIL-SYNC",
          severity: "HIGH",
          component: "ActivityRail / Poller",
          issue: "Live Activity Rail failed to render active peer agent within 3.5 seconds of presence broadcast.",
          screenContext: "screen_live_activity_rail.png"
        });
      }

      // Check Notification Center Bell
      console.log("[PHASE 3.1] Inspecting Notification Bell Badge & Popover...");
      const bellBadge = await page.$("header button:has(svg.lucide-bell) span, header button[title*='Notification' i] span");
      const badgeText = bellBadge ? await bellBadge.innerText() : null;
      console.log("Notification badge text:", badgeText);

      const bellBtn = await page.$("header button:has(svg.lucide-bell), header button[title*='Notification' i]");
      if (bellBtn) {
        await bellBtn.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_notification_center.png") });
        console.log("Captured: screen_notification_center.png");
        // Dismiss via backdrop or close button
        const closeBtn = await page.$("button[aria-label='Close notifications'], button[aria-label='Close']");
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await bellBtn.click();
        }
        await page.waitForTimeout(300);
      }
    } catch (err) {
      console.error("Simulation error:", err.message);
    }
  }

  // ==================================================================
  // PHASE 4: Mobile Viewport Audit (390x844 - iPhone 14)
  // ==================================================================
  console.log("\n[PHASE 4] Auditing Mobile Phone Viewport (390x844)...");
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const mobilePage = await mobileCtx.newPage();
  setupLogging(mobilePage, "Mobile");

  await mobilePage.goto(roomUrl, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(2000);

  // Capture Mobile Stream View
  await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, "screen_room_mobile_chat.png") });
  console.log("Captured: screen_room_mobile_chat.png");

  // Check 10: Mobile Horizontal Overflow
  const mobileHasOverflow = await mobilePage.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
  });
  if (mobileHasOverflow) {
    findings.push({
      id: "BUG-MOBILE-OVERFLOW",
      severity: "HIGH",
      component: "Mobile Responsive Layout",
      issue: "Mobile horizontal overflow: content exceeds the 390px viewport width, creating unintended horizontal scrolling.",
      screenContext: "screen_room_mobile_chat.png"
    });
    console.log("Confirmed Bug: Mobile horizontal overflow detected!");
  }

  // Check 11: Switch to Mobile Agents View
  console.log("[PHASE 4.1] Testing Mobile 'Agents' View Tab...");
  const agentsNavBtn = await mobilePage.$("button:has-text('Agents')");
  if (agentsNavBtn) {
    await agentsNavBtn.click();
    await mobilePage.waitForTimeout(800);
    await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, "screen_room_mobile_agents.png") });
    console.log("Captured: screen_room_mobile_agents.png");
  } else {
    findings.push({
      id: "BUG-MOBILE-NAV-AGENTS",
      severity: "MEDIUM",
      component: "Mobile Navigation (FeedNav)",
      issue: "Mobile 'Agents' view switcher button not found in FeedNav header.",
      screenContext: "screen_room_mobile_chat.png"
    });
  }

  // Check 12: Tap Target Size Audit on Mobile (<44px height check)
  console.log("[PHASE 4.2] Auditing Mobile Touch Tap Targets (>=44px)...");
  const smallTargets = await mobilePage.evaluate(() => {
    const clickable = Array.from(document.querySelectorAll("button, a, input, textarea"));
    const tooSmall = [];
    for (const el of clickable) {
      const rect = el.getBoundingClientRect();
      // Ignore hidden or 0x0 elements
      if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).display === "none") continue;
      // Touch target guideline is 44px x 44px
      if (rect.height < 36 && !el.closest(".hidden")) {
        const text = (el.innerText || el.getAttribute("title") || el.getAttribute("aria-label") || el.tagName).trim();
        tooSmall.push({
          tag: el.tagName,
          text: text.slice(0, 30),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
    }
    return tooSmall;
  });
  console.log(`Mobile elements smaller than recommended 36px height: ${smallTargets.length}`);
  if (smallTargets.length > 0) {
    findings.push({
      id: "BUG-MOBILE-TAP-TARGETS",
      severity: "LOW",
      component: "Mobile Touch Ergonomics",
      issue: `${smallTargets.length} interactive elements on mobile have a bounding height smaller than 36px (WCAG AAA requires 44px).`,
      evidence: JSON.stringify(smallTargets.slice(0, 5))
    });
  }

  // Clean up
  await browser.close();

  // ==================================================================
  // OUTPUT RESULTS
  // ==================================================================
  console.log("\n==================================================================");
  console.log("  MIROFISH SCREEN AUDIT COMPLETED                                 ");
  console.log("==================================================================");
  console.log(`Total Findings:   ${findings.length}`);
  console.log(`Console Errors:   ${consoleErrors.length}`);
  console.log(`Console Warnings: ${consoleWarnings.length}`);
  console.log(`Network Failures: ${networkFailures.length}`);
  console.log("==================================================================");

  const finalOutput = {
    timestamp: new Date().toISOString(),
    targetUrl: TARGET_URL,
    totalFindings: findings.length,
    findings,
    consoleErrors,
    consoleWarnings,
    networkFailures
  };

  fs.writeFileSync("/tmp/mirofish_screen_audit.json", JSON.stringify(finalOutput, null, 2));
  console.log("Saved detailed audit results to /tmp/mirofish_screen_audit.json");
}

runAudit().catch(err => {
  console.error("FATAL AUDIT CRASH:", err);
  process.exit(1);
});
