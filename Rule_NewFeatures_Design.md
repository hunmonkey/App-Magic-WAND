# Magic WAND 신규 기능 설계서 (14개)

> 작성일: 2026-05-23 · 대상: 재훈 님
> 이 문서는 코드 작성 **전에** 14개 기능의 화면 위치·모듈 구조·데이터 저장·구현 방식을 미리 정리한 청사진입니다.
> 검토 후 확정되면 Phase 순서대로 구현합니다. (검증: `npm run check` 문법 검사)

---

## 0. 공통 원칙 (모든 기능 적용)

기존 코드 패턴을 그대로 따릅니다. 새 기능 1개를 추가할 때 손대는 곳:

1. `electron/modules/<기능>.js` — 새 파일. `register(ipcMain)` 내보내고 `ipcMain.handle("<기능>:<동작>", ...)`
2. `electron/main.js` — `require` 1줄 + `registerIpcHandlers()`에 `<기능>.register(ipcMain)` 1줄
3. `electron/preload.js` — `magicWand.<기능>` 묶음에 메서드 노출
4. `renderer/index.html` — 사이드 메뉴 버튼 + `<section id="<기능>Page" class="page">` + `<script src="./pages/<기능>.js">`
5. `renderer/pages/<기능>.js` — 새 파일. 화면 동작
6. `package.json`의 `check` 스크립트 — `node --check` 대상에 새 파일 2개 추가

**데이터 저장**: 모두 `getDataDir()` 패턴(배포 시 `userData`, 개발 시 `data/`)으로 JSON 파일 저장. 외부 DB 불필요.

**단일 파일(.exe) 배포 영향**: `files` 글롭이 폴더 전체를 잡으므로 위 JS 파일들은 자동 포함. **새 외부 실행파일이 필요 없으므로 `extraResources` 수정 불필요** → 단일 exe 그대로 유지.

---

## 1. 메뉴 구조 변경안

현재 사이드바: `PC 관리` / `문서 관리` / `업무 도구` / `프로그램 종료`

14개를 끼우기 위한 제안 (★=신규 메뉴 항목, ⚙=메뉴 없이 전역 동작):

```
PC 관리
  기초 정보
  ★ 건강 점수 대시보드   ← 재미2 (+부팅속도 재미3, 온도게이지 재미4 위젯 포함)
  통합 점검 리포트
  점검 : HW,SW          ← 이벤트 로그(업무9)는 여기 패널로 추가 검토
  점검 : Network        ← 네트워크 속도·핑 모니터(업무8)는 여기 패널로 추가 검토
  점검 : Printer
  점검 : Share
  점검 : Security

자산 관리            ← ★ 신규 그룹
  ★ 자산 대장          ← 업무1
  ★ 원격 일괄 작업      ← 업무2

문서 관리
  양식지 제작 / 양식지 관리 / 라벨지 생성

업무 도구
  파일 백업/전송
  웹 바로가기
  ★ 시스템 정리         ← 업무6 (임시파일 청소)
  ★ 드라이버 백업       ← 업무7
  ★ 소프트웨어 라이선스  ← 업무5

(전역 — 메뉴 없음)
  ⚙ 명령 팔레트 Ctrl+K  ← 재미5
  ⚙ 작업 완료 알림/사운드 ← 재미6
  ⚙ 도전과제·이스터에그  ← 재미10
  ⚙ 점검 Before/After 비교 ← 재미9 (대시보드/통합점검에 버튼으로 노출)
```

> 메뉴가 길어지므로 그룹을 접고 펼치는 기능이 필요할 수 있습니다 — Phase 4에서 검토.

---

## 2. Phase별 기능 상세

### Phase 1 — 데이터 기반 (기존 점검 데이터 재활용)

#### [업무1] 자산 대장 (Asset Inventory)
- **메뉴**: 자산 관리 > 자산 대장 (`assetMenu` / `assetPage`)
- **모듈**: `electron/modules/asset.js` → `asset:list`, `asset:save`, `asset:read`, `asset:delete`, `asset:fromCheck`
- **preload**: `magicWand.asset.{list,save,read,delete,fromCheck}`
- **데이터**: `getDataDir()/assets.json` — 배열. 1건 = `{ id, assetTag, name, ip, spec, location, owner, purchaseDate, warrantyEnd, lastCheckedAt, history:[] }`
- **동작**: PC별 자산 카드/표. `통합 점검 리포트`·`기초 정보`에서 수집한 사양/IP를 "이 PC를 자산으로 등록" 버튼으로 자동 채움. 보증만료 임박(예: 30일)은 색 강조.
- **PowerShell**: 신규 없음 (기존 system-info 결과 재사용)
- **메모 연계**: `[[integrated-check-report]]`에 "다음 우선순위: 자산 이력"으로 이미 예고됨

#### [재미2] 건강 점수 대시보드
- **메뉴**: PC 관리 > 건강 점수 대시보드 (`healthMenu` / `healthPage`)
- **모듈**: `electron/modules/health.js` → `health:score` (HW점검·위험SW·디스크·메모리 결과를 모아 0~100 환산)
- **preload**: `magicWand.health.{score}`
- **데이터**: `getDataDir()/health_history.json` — 점수 이력(추세 그래프용)
- **동작**: 항목별 감점 규칙으로 총점 + 등급(🟢90+/🟡70+/🔴미만). 게이지/링 차트(순수 CSS·SVG, 외부 라이브러리 X). 부팅속도(재미3)·온도(재미4) 위젯을 이 화면에 함께 배치.
- **점수 규칙**: 설계 확정 시 별도 표로 정의 (예: 디스크 여유<10% −20, 위험SW 발견 −30, SMART 경고 −25 등)

#### [재미9] 점검 Before/After 비교
- **위치**: 대시보드/통합점검 화면에 "스냅샷 저장" + "비교" 버튼 (별도 메뉴 없음)
- **모듈**: `health.js`에 통합 → `health:snapshot`, `health:compare`
- **데이터**: `getDataDir()/snapshots.json` — 시점별 점검 결과 스냅샷
- **동작**: 청소·수리 전 "스냅샷" 저장 → 작업 후 다시 점검 → 두 시점을 나란히 표로 비교(개선=초록 ▲, 악화=빨강 ▼)

> **Phase 1 검증**: `npm run check` 통과 + 자산 1건 저장/불러오기, 점수 산출 동작 확인

---

### Phase 2 — 시스템 점검 확장 (PowerShell 기반, 패턴 유사)

#### [업무6] 시스템 정리 (임시파일·캐시 청소)
- **메뉴**: 업무 도구 > 시스템 정리 (`cleanupMenu` / `cleanupPage`)
- **모듈**: `electron/modules/cleanup.js` → `cleanup:scan`(용량 계산), `cleanup:run`(삭제), 진행률 이벤트 `cleanup:progress`
- **preload**: `magicWand.cleanup.{scan,run,onProgress}`
- **대상** *(확정)*: ① 휴지통 ② `%TEMP%` ③ Windows 임시폴더(`C:\Windows\Temp`) ④ 브라우저 캐시 ⑤ Windows Update 잔여물(`SoftwareDistribution\Download`) ⑥ **시스템 삭제 후 남은 찌꺼기 폴더**(`%TEMP%` 빈 잔존, `$WinDir\Installer\$PatchCache$` 등 안전 범위) ⑦ **메모리 덤프 파일**(`C:\Windows\Memory.dmp`, `C:\Windows\Minidump\*`, `%LOCALAPPDATA%\CrashDumps`) — **항목별 체크박스로 선택, 삭제 전 확인창 필수**
- **PowerShell**: `Remove-Item`, `Clear-RecycleBin`. 안전장치: 시스템 경로 화이트리스트만 허용, 와일드카드 루트 삭제 금지
- **주의**: CLAUDE.md 파괴적 명령 규칙 → 반드시 사용자 확인 후 실행, 보호 경로 하드코딩

#### [업무7] 드라이버 백업
- **메뉴**: 업무 도구 > 드라이버 백업 (`driverMenu` / `driverPage`)
- **모듈**: `electron/modules/driver.js` → `driver:list`, `driver:export`(폴더로 추출), `driver:progress`
- **preload**: `magicWand.driver.{list,export,onProgress}`
- **PowerShell**: `Export-WindowsDriver -Online -Destination <폴더>` (관리자 권한 필요할 수 있음 — 안내 문구)
- **동작**: 추출 폴더 선택 → 진행률 → 완료 후 폴더 열기 버튼 (file-tools 진행률 패턴 재사용)

#### [업무9] 이벤트 로그 분석기
- **위치**: PC 관리 > 점검: HW,SW 화면에 패널 추가 *(확정)*
- **모듈**: `electron/modules/event-log.js` → `eventLog:scan` (System/Application 로그의 Error·Warning 필터)
- **preload**: `magicWand.eventLog.{scan,saveText}`
- **PowerShell**: `Get-WinEvent` 또는 `Get-EventLog` — 최근 N일, 레벨=오류/경고, 빈도순 정렬 + 흔한 오류ID 한글 설명 매핑
- **동작**: 표로 표시, "원인 추정" 요약(자주 나오는 오류 그룹화), TXT 저장

#### [재미3] 부팅 속도 측정
- **위치**: 건강 점수 대시보드 위젯
- **모듈**: `health.js`에 통합 → `health:bootTime`
- **PowerShell**: `Get-WinEvent`로 이벤트ID 100(Diagnostics-Performance, 부팅 성능) 조회 → 부팅 소요(ms) 추출
- **데이터**: `getDataDir()/boot_history.json` — 최근/평균/최고 비교 막대그래프

#### [재미4] 하드웨어 온도 게이지
- **위치**: 건강 점수 대시보드 위젯
- **모듈**: `health.js`에 통합 → `health:temps` (기존 `tools/hardware-probe` 재사용)
- **외부도구**: **이미 번들된 LibreHardwareMonitor 스크립트 사용** → extraResources 변경 불필요
- **동작**: CPU/GPU 온도를 계기판(원형 게이지, CSS/SVG) 스타일로. 위험 구간 빨강

> **Phase 2 검증**: `npm run check` + 청소 스캔(삭제 없이) 용량 표시, 드라이버 목록 조회, 이벤트 로그 조회 동작

---

### Phase 3 — 모니터링·라이선스 (실시간 갱신)

#### [업무5] 소프트웨어 라이선스 관리
- **메뉴**: 업무 도구 > 소프트웨어 라이선스 (`swLicenseMenu` / `swLicensePage`)
- **모듈**: `electron/modules/sw-license.js` → `swLicense:list`, `swLicense:save`, `swLicense:delete`
- **preload**: `magicWand.swLicense.{list,save,delete}`
- **데이터**: `getDataDir()/sw_licenses.json` — `{ id, product, key, seats, purchaseDate, expireDate, note }`
- **동작**: 기존 `system:software`(설치 SW 목록)에서 항목을 끌어와 라이선스 정보 입력. 만료 임박 정렬·강조. (설치 SW 자동 매칭은 선택 입력 보조)
- **주의**: 정품키는 민감정보 → 화면 마스킹 토글, 로컬 JSON에만 저장(외부 전송 없음)

#### [업무8] 네트워크 속도·핑 모니터
- **위치**: PC 관리 > 점검: Network 화면에 패널 추가 (또는 신규 `netMonitorPage`)
- **모듈**: `electron/modules/net-monitor.js` → `netMonitor:start`, `netMonitor:stop`, 이벤트 `netMonitor:tick`
- **preload**: `magicWand.netMonitor.{start,stop,onTick}`
- **PowerShell/Node**: 주기적 `Test-Connection`(핑/지연/손실) + 어댑터 송수신 바이트 차이로 대역폭 추정
- **동작**: 실시간 라인 그래프(CSS/Canvas), 시작/정지 토글. 장애 시점 로그
- **주의**: 주기 폴링 → 창 닫힐 때 반드시 타이머 정리(메모리 누수 방지)

> **Phase 3 검증**: `npm run check` + 라이선스 1건 저장, 모니터 시작/정지 시 타이머 정상 해제 확인

---

### Phase 4 — UX 마감 (다른 기능 위에 얹는 편의)

#### [재미5] 명령 팔레트 (Ctrl+K)
- **위치**: 전역 (`renderer/app.js`에 통합 — 라우팅을 이미 담당하므로 적합)
- **동작**: Ctrl+K로 검색창 오버레이 → 메뉴/기능 이름 검색 → Enter로 `switchPage()` 호출. 순수 프론트(IPC 불필요)
- **데이터**: 없음 (메뉴 목록은 DOM에서 수집)

#### [재미6] 작업 완료 알림·사운드
- **위치**: 전역 (`renderer/app.js`의 `showToast` 확장 + 선택적 사운드)
- **동작**: 긴 작업(백업/전송/점검/청소/드라이버추출) 완료 시 토스트 + 효과음(작은 내장 오디오) + (선택) Electron `Notification`
- **설정**: 사운드 on/off는 `getDataDir()/ui_settings.json`에 저장
- **메인 연계**: 데스크톱 알림 쓰면 `main.js`에 `Notification` 핸들러 1개 추가

#### [재미10] 도전과제·이스터에그
- **위치**: 전역 + 대시보드에 배지 표시
- **모듈**: `electron/modules/achievements.js` → `achv:get`, `achv:bump` (카운터 증가)
- **데이터**: `getDataDir()/achievements.json` — `{ checksDone, backupsDone, badges:[] }`
- **동작**: "100대 점검 달성" 등 배지, 숨은 콘솔 명령/키 입력(예: 특정 키 시퀀스) 같은 소소한 재미
- **주의**: 어디까지나 가벼운 부가요소 — 업무 흐름 방해 금지

> **Phase 4 검증**: `npm run check` + Ctrl+K 팔레트로 페이지 이동, 작업 완료 시 알림 표시 확인

---

### Phase 5 — 원격 명령 일괄 실행 (업무2, 가장 무거움 · 맨 마지막)

#### [업무2] 원격 명령 일괄 실행
- **메뉴**: 자산 관리 > 원격 일괄 작업 (`remoteMenu` / `remotePage`)
- **모듈**: `electron/modules/remote.js` → `remote:targets`, `remote:run`, 이벤트 `remote:result`
- **데이터**: 대상 PC 목록은 [업무1] 자산 대장(`assets.json`)의 IP 재사용
- **⚠️ 본질적 난점 (착수 전 재확인 필요)**:
  - Magic WAND는 현재 **"현재 PC 1대"를 점검·관리**하는 도구. 여러 PC 원격 제어는 성격이 다릅니다.
  - 기술적으로 **대상 PC마다 WinRM(PowerShell 원격) 활성화 + 관리자 인증**이 필요합니다. 환경(OPNsense 방화벽·도메인 여부)에 따라 막힐 수 있음.
  - 보안상 다중 PC에 명령을 쏘는 기능이라 CLAUDE.md 파괴적 명령 규칙을 가장 엄격히 적용해야 함.
- **단계적 시작안**: 1차는 "선택한 1~N대에 **읽기 전용 점검 명령**(예: 사양 조회·핑)만 전송" → 검증 후 2차에서 재부팅/업데이트 같은 변경 명령 추가
- **PowerShell**: `Invoke-Command -ComputerName <목록> -Credential ...` (WinRM 기반)

> **Phase 5 검증**: 단일 원격 대상에 읽기 명령 1개 성공 후 확장. **착수 전 재훈 님과 환경·범위 재협의**

---

## 3. 단일 파일 배포 — 최종 점검표

| 항목 | 영향 | 조치 |
|------|------|------|
| 새 JS 모듈/페이지 14개 | exe에 자동 포함 (`files` 글롭) | 없음 |
| 새 JSON 데이터 파일 | 실행 시 userData에 생성 | 없음 |
| 새 외부 실행파일(.exe) | **없음** (온도는 기존 hardware-probe 재사용) | `extraResources` 수정 불필요 |
| 외부 npm 의존성 | **없음** (차트·QR 등 전부 내장 CSS/SVG/JS) | `package.json` 의존성 추가 없음 |
| 효과음 파일(재미6) | renderer에 작은 오디오 1개 포함 | `files` 글롭이 포함 (용량 미미) |

**결론: 14개 기능 모두 추가해도 단일 포터블 exe 구조·실행에 문제 없습니다.** 용량만 소폭 증가합니다.

---

## 4. 확정이 필요한 결정 사항

설계를 코드로 옮기기 전에 아래만 정해주시면 됩니다:

1. **이벤트 로그(업무9)·네트워크 모니터(업무8)** → 기존 점검 화면에 패널로 넣을까요, 아니면 독립 메뉴로 뺄까요?
2. **메뉴 그룹 접기/펼치기** → 메뉴가 길어지는데 도입할까요?
3. **건강 점수 규칙** → 제가 합리적 기본값(위 예시)으로 정해도 될까요, 아니면 직접 정하시겠어요?
4. **시스템 정리(업무6) 삭제 대상 범위** → 위 5종(휴지통/TEMP/Win임시/브라우저캐시/WU잔여물)으로 시작 OK인가요?
