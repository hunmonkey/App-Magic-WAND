rule MagicWand_Crack_Keygen_Tool
{
  meta:
    description = "Crack, keygen, activator keyword traces"
    severity = "high"
  strings:
    $strong1 = "keygen" nocase
    $strong2 = "kmspico" nocase
    $strong3 = "kms activator" nocase
    $strong4 = "hacktool" nocase
    $weak1 = "crack" nocase
    $weak2 = "patcher" nocase
  condition:
    any of ($strong*) or all of ($weak*)
}

rule MagicWand_Suspicious_Script
{
  meta:
    description = "Suspicious script command traces"
    severity = "medium"
  strings:
    $p1 = "Invoke-Expression" nocase
    $p2 = "IEX" nocase
    $p3 = "FromBase64String" nocase
    $p4 = "-EncodedCommand" nocase
    $p5 = "DownloadString" nocase
    $p6 = "Start-Process" nocase
  condition:
    2 of them
}

rule MagicWand_Remote_Admin_Abuse_Hint
{
  meta:
    description = "Remote administration tool abuse keyword traces"
    severity = "medium"
  strings:
    $r1 = "AnyDesk" nocase
    $r2 = "TeamViewer" nocase
    $r3 = "RustDesk" nocase
    $r4 = "UltraViewer" nocase
    $r5 = "remote control" nocase
    $r6 = "unattended access" nocase
  condition:
    2 of them
}
