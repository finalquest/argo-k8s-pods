# Plan: Parallelize Appium Server Execution

**Objective:** Modify the `maestro-orchestrator-chart/scripts/runner_appium.sh` script to launch a separate Appium server for each emulator, allowing for true parallel test execution and reducing bottlenecks.

**Execution Steps:**

1.  **Remove Single Appium Server Startup:**
    *   Locate and delete the lines responsible for starting the single, centralized Appium server. This is currently `yarn --cwd "$APPIUM_DIR" run appium --port 4723 --base-path /wd/hub > appium.log 2>&1 &`.

2.  **Start Appium Server per Emulator:**
    *   In the loop that reads `adb_hosts.txt` and generates the WebdriverIO configs, add logic to start a new Appium server for each emulator.
    *   Each server will be assigned a unique port (e.g., starting from 4724 and incrementing).
    *   The Process IDs (PIDs) of each started Appium server will be stored in a bash array for later management.

3.  **Update WebdriverIO Configuration:**
    *   Modify the `wdio.android.emu-*.ts` config file generation to use the unique port assigned to its corresponding Appium server. The `config.port` will be set dynamically.

4.  **Implement Graceful Shutdown:**
    *   At the end of the script, after all tests have run, add a cleanup function.
    *   This function will iterate through the array of stored PIDs and execute a `kill` command for each, ensuring no orphaned Appium processes are left running.
