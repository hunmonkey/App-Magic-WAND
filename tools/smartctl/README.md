# smartctl 내장 위치

이 폴더는 SSD/HDD/NVMe의 SMART 상세 진단을 위해 `smartctl.exe`를 넣는 자리입니다.

- 현재 내장 파일 위치: `tools/smartctl/smartctl.exe`
- 함께 둔 `drivedb.h`는 디스크 모델 정보를 더 잘 알아보기 위한 장치 목록 파일입니다.
- 파일이 없으면 앱은 Windows 기본 디스크 상태만 확인하고, SMART 상세 값은 건너뜁니다.
