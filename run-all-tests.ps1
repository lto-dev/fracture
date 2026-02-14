# ApiQuest - Run All Test Collections (Node.js Version)
# This script runs all example collections to verify functionality

$ErrorActionPreference = "Continue"
$testResults = @()

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ApiQuest - Running All Test Suites  " -ForegroundColor Cyan
Write-Host "  (Node.js/TypeScript Runner)         " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Build the packages first
Write-Host "Building Node.js packages..." -ForegroundColor Yellow
yarn build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build successful!" -ForegroundColor Green
Write-Host ""

# Test 1: Basic API Collection
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 1: Basic API Collection" -ForegroundColor Cyan
Write-Host "Expected: 9 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/basic-api.json
$test1Result = $LASTEXITCODE
$testResults += @{Name="Basic API"; Expected=9; ExitCode=$test1Result}
Write-Host ""

# Test 2: OAuth Workflow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 2: OAuth Workflow Demo" -ForegroundColor Cyan
Write-Host "Expected: 7 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/oauth-workflow.json
$test2Result = $LASTEXITCODE
$testResults += @{Name="OAuth Workflow"; Expected=7; ExitCode=$test2Result}
Write-Host ""

# Test 3: Variable Scoping with Environment
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 3: Variable Scoping (with -e flag)" -ForegroundColor Cyan
Write-Host "Expected: 10 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/variable-scoping.json -e examples/test-environment.json
$test3Result = $LASTEXITCODE
$testResults += @{Name="Variable Scoping"; Expected=10; ExitCode=$test3Result}
Write-Host ""

# Test 4: CLI Global Variables
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 4: CLI Global Variables (with -g flags)" -ForegroundColor Cyan
Write-Host "Expected: 7 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/cli-variables-test.json -g testKey=testValue -g apiVersion=v2
$test4Result = $LASTEXITCODE
$testResults += @{Name="CLI Variables"; Expected=7; ExitCode=$test4Result}
Write-Host ""

# Test 5: Collection-Level Iteration
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 5: Collection-Level Iteration (testData)" -ForegroundColor Cyan
Write-Host "Expected: 6 tests x 2 iterations = 12 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/iteration-collection-level.json
$test5Result = $LASTEXITCODE
$testResults += @{Name="Collection Iteration"; Expected=12; ExitCode=$test5Result}
Write-Host ""

# Test 6: CLI Data Loading
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 6: CLI Data Loading (--data CSV)" -ForegroundColor Cyan
Write-Host "Expected: 5 tests x 3 rows = 15 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/iteration-cli-data-test.json --data examples/users-data.csv
$test6Result = $LASTEXITCODE
$testResults += @{Name="CLI Data CSV"; Expected=15; ExitCode=$test6Result}
Write-Host ""

# Test 7: Test Control Flow (skip/fail)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 7: Test Control Flow (quest.skip/fail)" -ForegroundColor Cyan
Write-Host "Expected: 14 tests (9 pass, 2 fail demo, 3 skip)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/test-control-flow.json
$test7Result = $LASTEXITCODE
$testResults += @{Name="Control Flow (skip/fail)"; Expected=14; ExitCode=$test7Result; ExpectedFail=$true}
Write-Host ""

# Test 8: Comprehensive Script Execution
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 8: Comprehensive Script Execution" -ForegroundColor Cyan
Write-Host "Expected: Tests variables, folders, sendRequest async/callback" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/comprehensive-script-test.json
$test8Result = $LASTEXITCODE
$testResults += @{Name="Comprehensive Scripts"; Expected=10; ExitCode=$test8Result}
Write-Host ""

# Test 9: Test Dependencies and Conditions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 9: Test Dependencies and Conditions" -ForegroundColor Cyan
Write-Host "Expected: 14 tests (13 pass, 1 expected fail in iteration 2)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/test-dependencies-conditions.json
$test9Result = $LASTEXITCODE
$testResults += @{Name="Dependencies/Conditions"; Expected=14; ExitCode=$test9Result; ExpectedFail=$true}
Write-Host ""

# Test 10: Pre-Request Script Errors (INTENTIONAL FAILURE)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 10: Pre-Request Script Errors" -ForegroundColor Cyan
Write-Host "Expected: 0 requests execute, collection STOPS" -ForegroundColor Gray
Write-Host "Pre-request errors prevent request from executing" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/pre-request-error-test.json
$test10Result = $LASTEXITCODE
$testResults += @{Name="Pre-Request Errors"; Expected=0; ExitCode=$test10Result; ExpectedFail=$true}
Write-Host ""

# Test 11: Post/Test Script Errors (INTENTIONAL FAILURE)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 11: Post/Test Script Errors" -ForegroundColor Cyan
Write-Host "Expected: 2 requests, 3 tests, then collection STOPS" -ForegroundColor Gray
Write-Host "Post/test script errors stop collection after request executes" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/post-script-errors-test.json
$test11Result = $LASTEXITCODE
$testResults += @{Name="Post/Test Script Errors"; Expected=3; ExitCode=$test11Result; ExpectedFail=$true}
Write-Host ""

# Test 12: Network Error Handling
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 12: Network Error Handling" -ForegroundColor Cyan
Write-Host "Expected: 4 tests pass (request fails but tests handle it)" -ForegroundColor Gray
Write-Host "Exits successfully because all TESTS pass" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/network-error-test.json
$test12Result = $LASTEXITCODE
$testResults += @{Name="Network Error Handling"; Expected=4; ExitCode=$test12Result}
Write-Host ""

# Test 13: External Libraries
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 13: External Libraries (--allow-external-libraries)" -ForegroundColor Cyan
Write-Host "Expected: 8 tests (all passing)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
node packages/fracture/bin/cli.js run examples/external-libraries-test.json --allow-external-libraries
$test13Result = $LASTEXITCODE
$testResults += @{Name="External Libraries"; Expected=8; ExitCode=$test13Result}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "           TEST SUMMARY                 " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalTests = 0
$passedSuites = 0
$failedSuites = 0

foreach ($result in $testResults) {
    $totalTests += $result.Expected
    
    if ($result.ExpectedFail -eq $true) {
        $status = if ($result.ExitCode -ne 0) {
            $passedSuites++
            "PASSED (failed as expected)"
        } else {
            $failedSuites++
            "FAILED (should have failed)"
        }
        $color = if ($result.ExitCode -ne 0) { "Green" } else { "Red" }
    } else {
        $status = if ($result.ExitCode -eq 0) { 
            $passedSuites++
            "PASSED" 
        } else { 
            $failedSuites++
            "FAILED" 
        }
        $color = if ($result.ExitCode -eq 0) { "Green" } else { "Red" }
    }
    
    Write-Host ("{0,-30} {1,2} tests - " -f $result.Name, $result.Expected) -NoNewline
    Write-Host $status -ForegroundColor $color
}

Write-Host ""
Write-Host "Total Test Suites: $($testResults.Count)" -ForegroundColor Cyan
Write-Host "  Passed: $passedSuites" -ForegroundColor Green
if ($failedSuites -gt 0) {
    Write-Host "  Failed: $failedSuites" -ForegroundColor Red
}
Write-Host "Total Tests Expected: $totalTests" -ForegroundColor Cyan
Write-Host ""

if ($failedSuites -eq 0) {
    Write-Host "All test suites passed!" -ForegroundColor Green
    Write-Host "" 
    Write-Host "Node.js/TypeScript runner is fully operational!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$failedSuites test suite(s) failed!" -ForegroundColor Red
    exit 1
}
