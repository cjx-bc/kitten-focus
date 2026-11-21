package com.xiaomao.focus;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

/** One native boundary for session ownership, lifecycle commands and observation. */
final class FocusControl {
    interface TargetLaunch { Runnable prepare(String packageName) throws Exception; }
    private final TargetLaunch targetLaunch;
    private final Context context;
    private final LocalStore store;
    private final SessionClock clock;
    private final FocusEngine focus;
    private final RestEngine rest;
    private final LockEngine lock;
    private final FocusRecovery recovery;
    private final FocusProtection.AccessibilityState accessibility;
    private final DndProtection dnd;
    private final FocusNavigation navigation;
    private final FocusAntiClose antiClose;
    private final NotificationProtection notifications;
    private final RecentTasksProtection recentTasks;
    private final LauncherProtection launcher;
    private final WallpaperProtection wallpaper;

    FocusControl(Context context) {
        this(context, LocalStore.get(context), SessionClock.system(context));
    }

    FocusControl(Context context, LocalStore store, SessionClock clock) {
        this(context, store, clock, new FocusRecovery(context, store));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery) {
        this(context, store, clock, recovery, null);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery, FocusProtection.AccessibilityState accessibility) {
        this(context, store, clock, recovery, accessibility, new AndroidDndSystem(context));
    }

    FocusControl(Context context, LocalStore store, SessionClock clock, DndSystem system) {
        this(context, store, clock, new FocusRecovery(context, store), null, system);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, NotificationSystem system) {
        this(context, store, clock, new FocusRecovery(context, store), null, new AndroidDndSystem(context), system);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, LauncherSystem system) {
        this(context, store, clock, new FocusRecovery(context, store), null, new AndroidDndSystem(context),
            new AndroidNotificationSystem(context), launchTarget(context), FocusNavigation.android(context, null), new AndroidRecentTasksSystem(context), system);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, WallpaperSystem system) {
        this(context, store, clock, new FocusRecovery(context, store), null, new AndroidDndSystem(context),
            new AndroidNotificationSystem(context), launchTarget(context), FocusNavigation.android(context, null),
            new AndroidRecentTasksSystem(context), new AndroidAntiCloseSystem(context, null), new AndroidLauncherSystem(context), system);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, RecentTasksSystem system) {
        this(context, store, clock, new FocusRecovery(context, store), null, new AndroidDndSystem(context),
            new AndroidNotificationSystem(context), launchTarget(context), FocusNavigation.android(context, null), system);
    }

    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system) {
        this(context, store, clock, recovery, accessibility, system, new AndroidNotificationSystem(context));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system, NotificationSystem notificationSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, launchTarget(context));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, TargetLaunch targetLaunch) {
        this(context, store, clock, recovery, accessibility, new AndroidDndSystem(context), targetLaunch);
    }
    private static TargetLaunch launchTarget(Context context) {
        return packageName -> {
            android.content.Intent intent = context.getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent == null) throw new IllegalStateException("No launchable activity");
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            return () -> context.startActivity(intent);
        };
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system, TargetLaunch targetLaunch) {
        this(context, store, clock, recovery, accessibility, system, new AndroidNotificationSystem(context), targetLaunch, FocusNavigation.android(context, accessibility));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice) {
        this(context, store, clock, recovery, accessibility, system, new AndroidNotificationSystem(context), targetLaunch, navigationDevice);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, FocusNavigation.android(context, accessibility));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            new AndroidRecentTasksSystem(context), new AndroidAntiCloseSystem(context, accessibility));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice, AntiCloseSystem antiCloseSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            new AndroidRecentTasksSystem(context), antiCloseSystem);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice, RecentTasksSystem recentTasksSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            recentTasksSystem, new AndroidAntiCloseSystem(context, accessibility), new AndroidLauncherSystem(context));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice,
                 RecentTasksSystem recentTasksSystem, LauncherSystem launcherSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            recentTasksSystem, new AndroidAntiCloseSystem(context, accessibility), launcherSystem);
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice,
                 RecentTasksSystem recentTasksSystem, AntiCloseSystem antiCloseSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            recentTasksSystem, antiCloseSystem, new AndroidLauncherSystem(context));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice,
                 RecentTasksSystem recentTasksSystem, AntiCloseSystem antiCloseSystem, LauncherSystem launcherSystem) {
        this(context, store, clock, recovery, accessibility, system, notificationSystem, targetLaunch, navigationDevice,
            recentTasksSystem, antiCloseSystem, launcherSystem, new AndroidWallpaperSystem(context));
    }
    FocusControl(Context context, LocalStore store, SessionClock clock, FocusRecovery recovery,
                 FocusProtection.AccessibilityState accessibility, DndSystem system,
                 NotificationSystem notificationSystem, TargetLaunch targetLaunch, FocusNavigation.Device navigationDevice,
                 RecentTasksSystem recentTasksSystem, AntiCloseSystem antiCloseSystem, LauncherSystem launcherSystem, WallpaperSystem wallpaperSystem) {
        this.targetLaunch = targetLaunch;
        this.context = context.getApplicationContext();
        this.store = store;
        this.clock = clock;
        focus = new FocusEngine(context, store, clock);
        rest = new RestEngine(context, store, clock);
        lock = new LockEngine(context, store, clock);
        this.recovery = recovery;
        this.accessibility = accessibility;
        navigation = new FocusNavigation(context, store, clock, navigationDevice);
        antiClose = new FocusAntiClose(context, store, clock, antiCloseSystem);
        recovery.registerEffect(FocusRecovery.ANTI_CLOSE, () -> antiClose.release());
        dnd = new DndProtection(context, store.getDatabaseName(), system);
        notifications = new NotificationProtection(context, store.getDatabaseName(), clock, notificationSystem);
        recentTasks = new RecentTasksProtection(context, store.getDatabaseName(), clock, recentTasksSystem);
        launcher = new LauncherProtection(context, store.getDatabaseName(), clock, launcherSystem);
        wallpaper = new WallpaperProtection(context, store.getDatabaseName(), clock, wallpaperSystem);
        recovery.register(new FocusRecovery.RecoveryOperation() {
            public JSONObject preview() throws JSONException { return dnd.recoveryStep(); }
            public void restore() throws JSONException { dnd.restore(store.read("active")); }
        });
        recovery.register(new FocusRecovery.RecoveryOperation() {
            public JSONObject preview() throws JSONException { return notifications.recoveryStep(store.read("active")); }
            public void restore() throws JSONException { notifications.restore(store.read("active")); }
        });
        recovery.register(new FocusRecovery.RecoveryOperation() {
            public JSONObject preview() throws JSONException { return recentTasks.recoveryStep(store.read("active")); }
            public void restore() throws JSONException { recentTasks.restore(store.read("active")); }
        });
        recovery.register(new FocusRecovery.RecoveryOperation() {
            public JSONObject preview() throws JSONException { return launcher.recoveryStep(store.read("active")); }
            public void restore() throws JSONException { launcher.restore(store.read("active")); }
        });
        recovery.register(new FocusRecovery.RecoveryOperation() {
            public JSONObject preview() throws JSONException { return wallpaper.recoveryStep(store.read("active")); }
            public void restore() throws JSONException { wallpaper.restore(store.read("active")); }
        });
    }

    private void synchronizeEffects(JSONObject active) throws JSONException {
        dnd.synchronize(active);
        notifications.synchronize(active);
        recentTasks.synchronize(active);
        launcher.synchronize(active);
        wallpaper.synchronize(active);
    }

    JSONObject startFocus(JSONObject session) throws JSONException { return startFocus(session, false); }
    JSONObject startFocus(JSONObject session, boolean strictModeConfirmed) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注");
            focus.checkStart(session);
            JSONObject data = store.read("data");
            JSONObject preferences = data == null ? null : data.optJSONObject("preferences");
            JSONObject rawProtection = preferences == null ? null : preferences.optJSONObject("protection");
            JSONObject protection = rawProtection == null ? null : FocusProtection.resolveEffective(rawProtection);
            boolean strict = protection != null && Boolean.TRUE.equals(protection.opt("strict"))
                && session.optString("mode").equals("countdown");
            if (strict && !strictModeConfirmed)
                throw new IllegalStateException("请先确认严格倒计时：开始后不能暂停、取消或提前结束");
            JSONObject started = new JSONObject(session.toString()).put("strictMode", strict);
            started.remove("kind");
            started.remove("configurationId");
            started.remove("temporaryAccess");
            started.remove("originalEnhancedProtectionSettings");
            started.put("temporaryAccessRuntime", new JSONObject().put("used", 0).put("requests", new JSONArray()));
            started.put("state", "running").put("elapsedMs", 0).put("pausedMs", 0)
                .put("segments", new JSONArray());
            started.put("protection", accessibility == null ? FocusProtection.capture(context, store, session) : FocusProtection.capture(context, store, session, accessibility));
            started.put("dndRequested", protection != null && Boolean.TRUE.equals(protection.opt("dnd")));
            navigation.checkStart(started);
            antiClose.checkStart(started);
            started.put("notificationsRequested", protection != null && Boolean.TRUE.equals(protection.opt("interceptNotifications")));
            if (!FocusProtection.notificationWhitelistPass(protection))
                started.put("notificationWhitelistDisabled", true);
            dnd.checkStart(started);
            notifications.checkStart(started);
            recentTasks.checkStart(started);
            launcher.checkStart(started);
            wallpaper.checkStart(started);
            recovery.prepare(started);
            JSONObject result;
            try {
                result = focus.start(started);
            } catch (Exception error) {
                if (store.read("active") == null) {
                    try { recovery.releaseFinished(null); } catch (Exception ignored) { }
                }
                throw error;
            }
            FocusProtection.executionSucceeded();
            synchronizeEffects(store.read("active"));
            return projectTemporary(result);
        }
    }
    JSONObject focusAction(String action) throws JSONException {
        synchronized (store) {
            if (LockEngine.owns(store.read("active"))) {
                if (!action.equals("read")) throw new IllegalStateException("请返回当前锁机处理");
                lockAction("read", false);
                return focus.observe();
            }
            JSONObject observation = observeControl();
            JSONObject active = observation.getJSONObject("focus").optJSONObject("session");
            if (!action.equals("read") && active != null && active.optBoolean("strictMode")
                && active.optString("mode").equals("countdown") && !observation.optBoolean("needsReconcile"))
                throw new IllegalStateException("严格倒计时不能暂停、取消或提前结束；请等待本轮到期，帮助和故障恢复仍可进入");
            JSONObject result = focus.action(action);
            JSONObject remaining = result.optJSONObject("session");
            recovery.releaseFinished(remaining == null ? null : remaining.optString("id"));
            if (remaining == null) { navigation.release(); antiClose.release(); }
            synchronizeEffects(store.read("active"));
            return projectTemporary(result);
        }
    }
    JSONObject startLock(String configurationId) throws JSONException { return startLock(configurationId, false); }
    JSONObject startLock(String configurationId, boolean strictLockConfirmed) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("已有专注或锁机正在进行，请返回当前会话处理");
            JSONObject resting = rest.read().optJSONObject("session");
            if (resting != null && "running".equals(resting.optString("state")))
                throw new IllegalStateException("请先退出休息，再开始锁机");
            JSONObject configuration = lock.configuration(configurationId);
            if (Boolean.TRUE.equals(configuration.opt("strict")) && !strictLockConfirmed)
                throw new IllegalStateException("请先确认严格锁机：开始后不能暂停、取消或提前解除，到期自动结束");
            JSONObject session = lock.create(configuration);
            session.put("protection", accessibility == null
                ? FocusProtection.captureLock(context, store, configuration)
                : FocusProtection.captureLock(context, store, configuration, accessibility));
            navigation.checkStart(session);
            antiClose.checkStart(session);
            session.put("originalEnhancedProtectionSettings", FocusProtection.lockEnhancements(store, configuration));
            session.put("dndRequested", Boolean.TRUE.equals(FocusProtection.preferences(store).opt("dnd")));
            session.put("notificationsRequested", Boolean.TRUE.equals(FocusProtection.preferences(store).opt("interceptNotifications")));
            dnd.checkStart(session);
            notifications.checkStart(session);
            recentTasks.checkStart(session);
            launcher.checkStart(session);
            wallpaper.checkStart(session);
            recovery.prepare(session);
            JSONObject result;
            try {
                rest.exit();
                result = lock.start(session);
            } catch (Exception error) {
                if (store.read("active") == null) {
                    try { recovery.releaseFinished(null); } catch (Exception ignored) { }
                }
                throw error;
            }
            FocusProtection.executionSucceeded();
            synchronizeEffects(store.read("active"));
            return result;
        }
    }
    JSONObject lockAction(String action, boolean confirmed) throws JSONException {
        synchronized (store) {
            JSONObject result = lock.action(action, confirmed);
            JSONObject active = store.read("active");
            recovery.releaseFinished(active == null ? null : active.optString("id"));
            if (active == null) { navigation.release(); antiClose.release(); }
            synchronizeEffects(active);
            return result;
        }
    }
    JSONObject startRest(String recordId) throws JSONException {
        synchronized (store) {
            JSONObject result = rest.start(recordId);
            synchronizeEffects(store.read("active"));
            return result;
        }
    }
    JSONObject restAction(String action) throws JSONException {
        synchronized (store) {
            if (action.equals("exit")) rest.exit();
            return rest.read();
        }
    }

    /** Explicit lifecycle work for alarms, boot and other reconciliation triggers. */
    JSONObject reconcile() throws JSONException {
        synchronized (store) {
            focus.action("read");
            lock.action("read", false);
            rest.sync();
            JSONObject active = store.read("active");
            recovery.releaseFinished(active == null ? null : active.optString("id"));
            if (active == null) { navigation.release(); antiClose.release(); }
            synchronizeEffects(store.read("active"));
            return observeControl();
        }
    }

    /** Never checkpoints, settles, writes, schedules alarms or changes notifications. */
    JSONObject observeControl() throws JSONException {
        synchronized (store) {
            JSONObject focusSnapshot = focus.observe();
            JSONObject restSnapshot = rest.observe();
            JSONObject lockSnapshot = lock.observe();
            JSONObject active = store.read("active");
            if (active != null && active.optJSONObject("protection") != null) {
                active.getJSONObject("protection").put("applicationsWithdrawn", recovery.withdrawn(active.optString("id"), FocusRecovery.APPLICATIONS));
                active.getJSONObject("protection").put("navigationWithdrawn", recovery.withdrawn(active.optString("id"), FocusRecovery.NAVIGATION));
                active.getJSONObject("protection").put("antiCloseWithdrawn", recovery.withdrawn(active.optString("id"), FocusRecovery.ANTI_CLOSE));
            }
            if (active != null) {
                if (LockEngine.owns(active)) lockSnapshot.put("session", active);
                else focusSnapshot.put("session", active);

            }
            JSONObject resting = restSnapshot.optJSONObject("session");
            boolean runningRest = resting != null && resting.optString("state").equals("running");
            boolean needsReconcile = active != null && (
                active.optInt("bootId") != clock.boot() || clock.mono() < active.optLong("anchorMono")
                || active.optString("mode").equals("countdown")
                    && (LockEngine.owns(active) ? lockSnapshot.optLong("remainingMs") == 0 : focusSnapshot.optLong("elapsedMs") >= active.optLong("targetMs")));
            needsReconcile |= runningRest && (resting.optInt("bootId") != clock.boot()
                || restSnapshot.optLong("remainingMs") == 0);
            JSONObject observation = new JSONObject()
                .put("owner", active != null ? LockEngine.owns(active) ? "lock" : "focus" : runningRest ? "rest" : JSONObject.NULL)
                .put("focus", projectTemporary(focusSnapshot)).put("rest", restSnapshot).put("lock", lockSnapshot)

                .put("dnd", dnd.observe(active))
                .put("notifications", notifications.observe(active))
                .put("recentTasks", recentTasks.observe(active))
                .put("launcher", launcher.observe(active))
                .put("wallpaper", getWallpaperStatus())
                .put("needsReconcile", needsReconcile);
            return observation.put("navigation", navigation.observe(observation)).put("antiClose", antiClose.observe(observation))
                .put("mainEntry", mainEntryStatus(observation));
        }
    }

    private JSONObject mainEntryStatus(JSONObject observation) throws JSONException {
        JSONObject session = ControlSession.from(observation);
        boolean requested = FocusRecovery.mainEntryRequested(session);
        boolean withdrawn = requested && recovery.withdrawn(session.optString("id"), FocusRecovery.MAIN_ENTRY);
        return new JSONObject().put("requested", requested).put("withdrawn", withdrawn)
            .put("active", requested && !withdrawn && !observation.optBoolean("needsReconcile"));
    }
    /** Read-only policy shared by Android launch/warm entry and every Vue navigation. */
    JSONObject resolveMainEntry(String path) throws JSONException {
        synchronized (store) {
            JSONObject status = observeControl().getJSONObject("mainEntry");
            boolean safe = "/lock".equals(path) || "/permissions".equals(path) || "/help".equals(path)
                || "/emergency".equals(path) || "/recovery".equals(path);
            return status.put("path", status.optBoolean("active") && !safe ? "/lock" : path);
        }
    }

    private boolean temporaryEligible(JSONObject session) throws JSONException {
        JSONObject policy = session == null ? null : session.optJSONObject("protection");
        return policy != null && !"lock".equals(session.optString("kind")) && policy.optBoolean("study")
            && policy.optBoolean("temporaryAccessAllowed", true)
            && !recovery.withdrawn(session.optString("id"), FocusRecovery.APPLICATIONS)
            && !(session.optBoolean("strictMode") && session.optString("mode").equals("countdown"))
            && session.optInt("bootId") == clock.boot() && clock.mono() >= session.optLong("anchorMono")
            && !(session.optString("mode").equals("countdown") &&
                session.optLong("elapsedMs") + (session.optString("state").equals("running")
                    ? clock.mono() - session.optLong("anchorMono") : 0) >= session.optLong("targetMs"));
    }
    private JSONObject temporaryState(JSONObject session) throws JSONException {
        JSONObject runtime = session == null ? null : session.optJSONObject("temporaryAccessRuntime");
        int used = runtime == null ? 0 : runtime.optInt("used");
        JSONObject grant = runtime == null ? null : runtime.optJSONObject("grant");
        long remaining = grant != null && temporaryEligible(session) && grant.optInt("bootId") == clock.boot()
            && clock.mono() >= grant.optLong("startedMono") ? Math.max(0, grant.optLong("deadlineMono") - clock.mono()) : 0;
        return new JSONObject().put("used", used).put("remainingUses", Math.max(0, 3 - used))
            .put("targetPackage", remaining > 0 ? grant.optString("targetPackage") : JSONObject.NULL)
            .put("targetLabel", remaining > 0 ? grant.optString("targetLabel") : JSONObject.NULL)
            .put("remainingMs", remaining).put("expiresAt", remaining > 0 ? grant.optLong("expiresAt") : JSONObject.NULL);
    }
    private JSONObject projectTemporary(JSONObject snapshot) throws JSONException {
        JSONObject session = snapshot.optJSONObject("session");
        if (session != null) {
            JSONObject state = temporaryState(session);
            session.remove("temporaryAccessRuntime"); session.put("temporaryAccess", state);
        }
        return snapshot;
    }
    private JSONObject grantResult(String status, String reason, boolean replayed, JSONObject session) throws JSONException {
        return new JSONObject().put("status", status).put("reason", reason).put("replayed", replayed)
            .put("state", temporaryState(session));
    }
    JSONObject grantTemporaryAccess(JSONObject request) throws JSONException {
        synchronized (store) {
            JSONObject session = store.read("active");
            if (request == null || session == null || !session.optString("id").equals(request.optString("sessionId")))
                return grantResult("denied", "本轮专注已变更，请重新打开阻挡页", false, session);
            if (!temporaryEligible(session))
                return grantResult("denied", "只有普通学霸模式可以临时放行；严格倒计时或已撤销的保护不能放行", false, session);
            String target = request.optString("targetPackage"), id = request.optString("requestId");
            Object duration = request.opt("durationMinutes");
            if (!(duration instanceof Number) || ((Number) duration).doubleValue() != ((Number) duration).intValue()
                || !java.util.Arrays.asList(1, 3, 5).contains(((Number) duration).intValue())
                || target.isEmpty() || id.isEmpty() || id.length() > 160)
                return grantResult("denied", "请选择 1、3 或 5 分钟，并提供有效的应用和请求标识", false, session);
            int minutes = ((Number) duration).intValue();
            JSONObject runtime = session.optJSONObject("temporaryAccessRuntime");
            if (runtime == null) runtime = new JSONObject().put("used", 0).put("requests", new JSONArray());
            JSONArray requests = runtime.getJSONArray("requests");
            for (int i = 0; i < requests.length(); i++) {
                JSONObject previous = requests.getJSONObject(i);
                if (id.equals(previous.optString("requestId")))
                    return grantResult(previous.optString("targetPackage").equals(target) && previous.optInt("durationMinutes") == minutes
                        ? "granted" : "denied", "此请求已处理，重试不会再次扣次或延长时间", true, session);
            }
            if (runtime.optInt("used") >= 3) return grantResult("denied", "本轮三次临时放行已用完", false, session);
            JSONObject current = temporaryState(session);
            if (current.optLong("remainingMs") > 0 && !Boolean.TRUE.equals(request.opt("replaceConfirmed")))
                return grantResult("confirmation-required", "继续将结束上一个应用的临时放行", false, session);
            JSONObject observation = observeControl();
            observation.getJSONObject("focus").getJSONObject("session").remove("temporaryAccess");
            if (!FocusProtection.shouldBlock(context, observation, target, ""))
                return grantResult("denied", "此应用不受本轮限制，无需临时放行", false, session);
            if (!(accessibility == null ? FocusProtection.authorized(context) && FocusAccessibilityService.connected()
                : accessibility.authorized() && accessibility.connected()))
                return grantResult("failed", "应用限制授权或服务连接已失效，没有扣次", false, session);
            JSONObject before = new JSONObject(session.toString());
            try {
                Runnable launch = targetLaunch.prepare(target);
                if (launch == null) throw new IllegalStateException("应用没有可打开的入口");
                String label = target;
                try { label = context.getPackageManager().getApplicationLabel(context.getPackageManager().getApplicationInfo(target, 0)).toString(); }
                catch (android.content.pm.PackageManager.NameNotFoundException ignored) { }
                long now = clock.mono();
                runtime.put("used", runtime.optInt("used") + 1).put("grant", new JSONObject()
                    .put("targetPackage", target).put("targetLabel", label).put("startedMono", now)
                    .put("deadlineMono", now + minutes * 60000L).put("bootId", clock.boot())
                    .put("expiresAt", clock.epoch() + minutes * 60000L));
                requests.put(new JSONObject().put("requestId", id).put("targetPackage", target).put("durationMinutes", minutes));
                session.put("temporaryAccessRuntime", runtime);
                // One durable state write contains both the grant and its debit. The store lock
                // prevents accessibility observation or concurrent requests seeing a partial grant.
                store.write("active", session);
                launch.run();
                return grantResult("granted", "临时放行已生效，到期后重新限制", false, session);
            } catch (Exception error) {
                store.write("active", before);
                return grantResult("failed", "无法打开此应用，没有扣次：" + error.getClass().getSimpleName(), false, before);
            }
        }
    }

    JSONObject loadData() throws JSONException { return store.loadData(); }
    /** OS-event command; callers must supply actual package/class from accessibility. */
    boolean navigationWindow(String packageName, String className) throws JSONException {
        synchronized (store) { return navigation.window(observeControl(), packageName, className); }
    }
    boolean antiCloseWindow(String packageName, String className) throws JSONException {
        synchronized (store) { return antiClose.window(observeControl(), packageName, className); }
    }
    JSONObject previewRecovery() throws JSONException { synchronized (store) { return recovery.preview(); } }
    JSONObject confirmRecovery(String revision) throws JSONException { synchronized (store) {
        JSONObject result = recovery.confirm(revision);
        navigation.release();
        return result;
    } }

    JSONObject getDndStatus() throws JSONException {
        synchronized (store) { return dnd.observe(store.read("active")); }
    }

    JSONObject restoreDnd() throws JSONException {
        synchronized (store) { return dnd.restore(store.read("active")); }
    }
    JSONObject getNotificationStatus() throws JSONException {
        synchronized (store) { return notifications.observe(store.read("active")); }
    }
    JSONObject getRecentTasksStatus() throws JSONException {
        synchronized (store) {
            JSONObject status = recentTasks.observe(store.read("active"));
            JSONObject configured = new JSONObject().put("protection", FocusProtection.preferences(store));
            return status.put("preferenceEnabled", RecentTasksProtection.requested(configured));
        }
    }
    JSONObject getLauncherStatus() throws JSONException {
        synchronized (store) {
            JSONObject status = launcher.observe(store.read("active"));
            return status.put("preferenceEnabled", LauncherProtection.requested(new JSONObject().put("protection", FocusProtection.preferences(store))));
        }
    }
    JSONObject getWallpaperStatus() throws JSONException {
        synchronized (store) {
            return wallpaper.observe(store.read("active")).put("preferenceEnabled",
                WallpaperProtection.requested(new JSONObject().put("protection", FocusProtection.preferences(store))))
                .put("lastAssociation", WallpaperLifecycle.observation(context));
        }
    }
    JSONObject prepareWallpaper(boolean limitsAccepted, boolean originalMatches) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注或锁机，再保存新原壁纸");
            wallpaper.prepare(limitsAccepted, originalMatches); return getWallpaperStatus();
        }
    }
    JSONObject wallpaperPickerReturned(String pickerToken) throws JSONException {
        synchronized (store) { wallpaper.pickerReturned(store.read("active"), pickerToken); return getWallpaperStatus(); }
    }
    JSONObject requestWallpaperPicker(boolean original) throws JSONException {
        synchronized (store) { wallpaper.requestPicker(store.read("active"), original); return getWallpaperStatus(); }
    }
    JSONObject importWallpaperOriginal(String uri, boolean lockSource) throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注或锁机，再选择原图");
            wallpaper.importOriginal(uri, lockSource); return getWallpaperStatus();
        }
    }
    JSONObject confirmWallpaperManualRecovery(boolean acknowledged) throws JSONException {
        synchronized (store) { wallpaper.confirmManualRecovery(acknowledged); return getWallpaperStatus(); }
    }
    /** A real framework callback reconnects the existing owner; it never starts a round. */
    JSONObject wallpaperEngineCreated(boolean preview) throws JSONException {
        synchronized (store) {
            wallpaper.engineCreated(preview);
            if (preview) return observeControl();
            JSONObject result = reconcile();
            WallpaperLifecycle.record(context, "existing_session_reconciled", false, result);
            return result;
        }
    }
    void wallpaperPreviewDestroyed() throws JSONException { synchronized (store) { wallpaper.previewDestroyed(); } }
    void restoreLauncher() throws JSONException { synchronized (store) { launcher.restore(store.read("active")); } }
    void synchronizeNotifications() throws JSONException {
        synchronized (store) { notifications.synchronize(store.read("active")); }
    }
    void notificationPosted(NotificationSystem.Notice notice) throws JSONException {
        synchronized (store) { notifications.posted(store.read("active"), notice); }
    }
    void notificationRemoved(String key, boolean snoozed) throws JSONException {
        notificationRemoved(key, snoozed, false);
    }
    void notificationRemoved(String key, boolean snoozed, boolean clicked) throws JSONException {
        synchronized (store) { notifications.removed(key, snoozed, clicked); }
    }

    void replaceData(JSONObject data) throws JSONException {
        synchronized (store) {
            BusinessBackupData.validate(data);
            JSONObject portable = BusinessBackupData.portable(data);
            prepareDataReplacement();
            store.saveData(portable, true);
            Reminders.cancelFocus(context);
            Reminders.cancelRest(context);
        }
    }
    /** All backup replacement paths use the registered cleanup contract before writing data. */
    void prepareDataReplacement() throws JSONException {
        synchronized (store) {
            if (store.read("active") != null) throw new IllegalStateException("请先结束当前专注或锁机，再恢复备份");
            JSONObject preview = recovery.preview();
            if (recovery.confirm(preview.optString("revision")).optBoolean("pending"))
                throw new IllegalStateException("保护仍有待恢复项目，请先进入故障恢复修复，再恢复备份；原数据已保留");
        }
    }
}
