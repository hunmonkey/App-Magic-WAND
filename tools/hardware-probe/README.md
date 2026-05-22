# 센서 보조 진단기 내장 위치

이 폴더는 LibreHardwareMonitor 기반 보조 진단기를 넣는 자리입니다.

- 기본 내장 방식: `MagicWandHardwareProbe.ps1` + `LibreHardwareMonitorLib.dll` 및 관련 DLL
- 선택 실행 파일 위치: `tools/hardware-probe/MagicWandHardwareProbe.exe`
- 앱은 실행 파일이 있으면 우선 사용하고, 없으면 PowerShell 스크립트로 CPU/GPU/메인보드 센서 값을 읽습니다.
- 파일이 없으면 Windows가 기본 제공하는 제한적인 온도 정보와 `nvidia-smi` GPU 정보만 확인합니다.

보조 진단기의 JSON은 아래 둘 중 하나의 형태를 사용할 수 있습니다.

```json
{
  "sensors": [
    { "hardwareName": "CPU", "name": "Core Max", "type": "Temperature", "value": 62.5 }
  ]
}
```

또는 LibreHardwareMonitor 구조처럼 `Hardware` 안에 `Sensors`와 `SubHardware`를 중첩해서 내려보내도 됩니다.
