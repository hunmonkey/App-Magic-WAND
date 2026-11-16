# Magic WAND

> An all-in-one Windows toolkit for in-house IT and office administration:
> PC diagnostics (hardware, SMART, network, printers, security), asset management, form/label makers
> and admin-work boards — packaged as a single portable Electron executable.

사내 PC 관리와 총무·행정 업무에 필요한 도구를 **하나로 모은 Windows 데스크톱 앱**입니다.
설치 없이 실행 파일 하나로 동작하는 포터블 프로그램이라, USB에 담아 여러 PC를 돌며 점검할 수 있습니다.

---

## 주요 기능

| 메뉴 | 할 수 있는 일 |
|---|---|
| **PC 관리** | PC 기본 정보, 성능 점검, 하드웨어(온도·디스크 SMART), 소프트웨어, 이벤트 로그, 네트워크(IP 대역 스캔·진단), 프린터, 공유폴더, 계정·보안 점검 |
| **자산 관리** | PC 자산 등록·목록 관리, 원격 일괄 작업 |
| **문서 관리** | 양식지 제작·관리, 라벨지 생성(기본·사용자 지정 칸 크기) |
| **행정 업무** | 상황판, 거래처, 비품 수불, 구매 진행, 계약 만료 관리, 요청 접수, 업무 체크리스트, 빠른 메모 |
| **부가기능** | 백업·전송, 바로가기 관리, 파일명 일괄 변경, 시작 프로그램 관리, 외부 저장장치 복구, 시스템 최적화, 장치 드라이버 관리, 소프트웨어 라이선스 관리 |

### 설계 포인트

- **포터블 구조** — 겉으로 보이는 파일은 exe 하나입니다. 자료와 설정은 실행 파일 옆의 숨김 폴더 `MagicWAND_Data/`에 저장되어, 함께 옮기면 그대로 이어서 쓸 수 있습니다.
- **정품키 인증** — 공개키 서명 방식의 라이선스 파일로 사용 권한을 확인합니다.
- **보조 진단 도구 내장** — 센서·디스크·의심 파일 점검을 위해 검증된 외부 도구를 함께 묶었습니다(아래 참고).

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 앱 | Electron · Node.js · HTML/CSS/JavaScript |
| 시스템 연동 | PowerShell · Windows 기본 명령 |
| 배포 | electron-builder (Windows 포터블 exe) |
| 초기 시제품 | Python · PySide6 (`src/magic_wand/`, 참고용으로 보관) |

## 빠른 시작

```powershell
npm install
npm start            # 개발 실행
npm run check        # 문법 점검
npm run dist         # 포터블 exe 만들기 → dist/
```

## 함께 묶은 외부 도구

| 도구 | 용도 | 라이선스 |
|---|---|---|
| [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) | CPU·GPU·메인보드 센서 값 읽기 | MPL-2.0 |
| [smartmontools (smartctl)](https://www.smartmontools.org/) | SSD·HDD·NVMe SMART 상세 진단 | GPL-2.0 |
| [YARA](https://github.com/VirusTotal/yara) | 크랙·키젠 흔적 등 의심 파일 보조 점검 | BSD-3-Clause |

각 도구의 저작권과 라이선스는 해당 프로젝트에 있습니다. YARA 점검은 백신을 대신하지 않으며, 실제 악성 여부는 Microsoft Defender 등 백신 결과와 함께 판단해야 합니다.

---

만든 사람: [hunmonkey](https://github.com/hunmonkey)
