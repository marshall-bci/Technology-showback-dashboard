' ============================================================
' COST MANAGEMENT MACRO v6 - CLEAN REWRITE
'
' COST MODEL LAYOUT (A-M):
'   A=Branch Name, B=GL Code, C=Branch Code, D=PID Codes
'   E=GL Expense Category, F=Cost Model Category, G=Description
'   H=Required or Requested, I=Current Cost Model, J=Allocation
'   K=Potential Future Cost Model, L=Showback Type, M=User Listing
'
' USER BASED LISTING LAYOUT (A-R):
'   A=Branch Name, B=GL Code, C=Branch Code, D=Product ID, E=Description
'   F=CEO, G=Legal, H=Corp Ops, I=HR, J=Audit, K=CD&O
'   L=Finance, M=Technology, N=IO, O=IRR, P=PE, Q=CM&CI, R=ISR
'
' OUTPUT LAYOUT (B-AE):
'   B=Branch Name, C=G/L Codes, D=Branch Codes, E=PID Codes
'   F=GL Expense Category, G=Cost Model Category, H=Description
'   I=Required or Requested, J=Current Cost Model, K=Allocation
'   L=Potential Future Cost Model, M=Showback Type
'   N=Actuals, O=Forecast, P=Forecast, Q=Budget
'   R=CEO, S=Legal, T=HR, U=Audit, V=CD&O+CorpOps, W=Finance
'   X=Technology, Y=IO, Z=IRR, AA=ISR, AB=CM&CI, AC=PE
'   AD=Comments
'
' SHEET6: H1=Tab Name, J1=Spread FY
' LOOKUP KEY: BranchCode|GLCode|PID
' ============================================================

' --- DEPARTMENT CONSTANTS ---
' Output columns R(18) through AC(29), index 0-11:
'   0=CEO, 1=Legal, 2=HR, 3=Audit, 4=CD&O+CorpOps
'   5=Finance, 6=Technology, 7=IO, 8=IRR, 9=ISR, 10=CM&CI, 11=PE
'
' Headcount keys (matching Short Department Code in Headcount sheet):
'   CEO, Legal, HR, Audit, CD&O(+Corp Ops), Finance, Technology, IO, IRR, ISR, CM&CI, PE
'
' User Listing columns F(6)-R(18), UL index 0-12:
'   0=CEO, 1=Legal, 2=CorpOps, 3=HR, 4=Audit, 5=CD&O
'   6=Finance, 7=Technology, 8=IO, 9=IRR, 10=PE, 11=CM&CI, 12=ISR

Sub ParseOCToManagementTab()
    
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    
    ' --- WORKSHEETS ---
    Dim wsSource As Worksheet, wsDest As Worksheet
    Dim wsCM As Worksheet, wsHC As Worksheet, wsUL As Worksheet
    
    ' --- VARIABLES ---
    Dim lastRow As Long, destRow As Long, i As Long
    Dim cellVal As String, fiscalYear As String, spreadYear As String, sheetName As String
    Dim prodID As String, prodName As String, acctNum As String, acctName As String
    Dim levelCode As String, levelName As String, productPart As String
    Dim remainder As String, afterAcct As String, levelPart As String
    Dim colonPos As Long, acctStart As Long, lastDash As Long
    
    ' =============================================
    ' PHASE 1: READ INPUTS
    ' =============================================
    Set wsSource = ThisWorkbook.Sheets("OC Data Refresh")
    fiscalYear = Trim(CStr(wsSource.Range("H1").Value))
    spreadYear = Trim(CStr(wsSource.Range("J1").Value))
    
    If fiscalYear = "" Then MsgBox "Enter fiscal year in H1.", vbExclamation: GoTo CleanUp
    If spreadYear = "" Then MsgBox "Enter spread FY in J1.", vbExclamation: GoTo CleanUp
    
    Dim fyB3 As String, fyC3 As String, fyD3 As String, fyE3 As String
    fyB3 = CStr(wsSource.Range("B3").Value)
    fyC3 = CStr(wsSource.Range("C3").Value)
    fyD3 = CStr(wsSource.Range("D3").Value)
    fyE3 = CStr(wsSource.Range("E3").Value)
    
    sheetName = fiscalYear & " Management Tab"
    If Len(sheetName) > 31 Then MsgBox "Sheet name too long.", vbCritical: GoTo CleanUp
    
    ' Delete existing sheet if needed
    Dim wsCheck As Worksheet
    On Error Resume Next: Set wsCheck = ThisWorkbook.Sheets(sheetName): On Error GoTo 0
    If Not wsCheck Is Nothing Then
        If MsgBox("'" & sheetName & "' exists. Delete and recreate?", vbYesNo) = vbNo Then GoTo CleanUp
        Application.DisplayAlerts = False: wsCheck.Delete: Application.DisplayAlerts = True
    End If
    
    ' =============================================
    ' PHASE 2: LOAD COST MODEL (key = BranchCode|GLCode|PID)
    ' Stores: (0)Desc, (1)Required, (2)CurrentCostModel, (3)Allocation,
    '         (4)PotentialFuture, (5)Showback, (6)UserListing
    ' =============================================
    On Error Resume Next: Set wsCM = ThisWorkbook.Sheets("Cost Model"): On Error GoTo 0
    
    Dim dictCM As Object: Set dictCM = CreateObject("Scripting.Dictionary")
    dictCM.CompareMode = vbTextCompare
    
    If Not wsCM Is Nothing Then
        Dim cmRow As Long, cmLast As Long
        cmLast = wsCM.Cells(wsCM.Rows.Count, "A").End(xlUp).Row
        For cmRow = 2 To cmLast
            Dim cmBranch As String, cmBC As String, cmGL As String, cmPID As String, cmKey As String
            cmBranch = Trim(CStr(wsCM.Cells(cmRow, 1).Value))
            If Len(cmBranch) >= 4 Then cmBC = Left(cmBranch, 4) Else cmBC = cmBranch
            cmGL = Trim(CStr(wsCM.Cells(cmRow, 2).Value))
            cmPID = Trim(CStr(wsCM.Cells(cmRow, 4).Value))
            cmKey = cmBC & "|" & cmGL & "|" & cmPID
            If cmPID <> "" And Not dictCM.Exists(cmKey) Then
                Dim cd(0 To 6) As String
                cd(0) = Trim(CStr(wsCM.Cells(cmRow, 7).Value))   ' G: Description
                cd(1) = Trim(CStr(wsCM.Cells(cmRow, 8).Value))   ' H: Required
                cd(2) = Trim(CStr(wsCM.Cells(cmRow, 9).Value))   ' I: Current Cost Model
                cd(3) = Trim(CStr(wsCM.Cells(cmRow, 10).Value))  ' J: Allocation
                cd(4) = Trim(CStr(wsCM.Cells(cmRow, 11).Value))  ' K: Potential Future
                cd(5) = Trim(CStr(wsCM.Cells(cmRow, 12).Value))  ' L: Showback
                cd(6) = Trim(CStr(wsCM.Cells(cmRow, 13).Value))  ' M: User Listing
                dictCM.Add cmKey, cd
            End If
        Next cmRow
    End If
    
    ' =============================================
    ' PHASE 3: LOAD HEADCOUNT (key = Short Dept Code)
    ' =============================================
    On Error Resume Next: Set wsHC = ThisWorkbook.Sheets("Headcount"): On Error GoTo 0
    
    Dim hcCol As Long: hcCol = 0
    If Not wsHC Is Nothing Then
        Dim hc As Long
        For hc = 1 To 20
            If Trim(CStr(wsHC.Cells(3, hc).Value)) = spreadYear Then hcCol = hc: Exit For
        Next hc
    End If
    If hcCol = 0 Then MsgBox "'" & spreadYear & "' not found in Headcount row 3.", vbExclamation: GoTo CleanUp
    
    Dim dictHC As Object: Set dictHC = CreateObject("Scripting.Dictionary")
    dictHC.CompareMode = vbTextCompare
    Dim hcR As Long
    For hcR = 4 To 30
        Dim dCode As String: dCode = Trim(CStr(wsHC.Cells(hcR, 2).Value))
        If dCode <> "" And LCase(dCode) <> "cir" Then
            If Not dictHC.Exists(dCode) Then
                Dim hcV As Double: hcV = 0
                If IsNumeric(wsHC.Cells(hcR, hcCol).Value) Then hcV = CDbl(wsHC.Cells(hcR, hcCol).Value)
                dictHC.Add dCode, hcV
            End If
        End If
    Next hcR
    
    ' =============================================
    ' PHASE 4: LOAD USER BASED LISTING (key = BranchCode|GLCode|PID)
    ' UL index 0-12: CEO,Legal,CorpOps,HR,Audit,CD&O,Finance,Tech,IO,IRR,PE,CM&CI,ISR
    ' =============================================
    On Error Resume Next: Set wsUL = ThisWorkbook.Sheets("User Based Listing"): On Error GoTo 0
    
    Dim dictUL As Object: Set dictUL = CreateObject("Scripting.Dictionary")
    dictUL.CompareMode = vbTextCompare
    
    If Not wsUL Is Nothing Then
        Dim ulR As Long, ulLast As Long
        ulLast = wsUL.Cells(wsUL.Rows.Count, "A").End(xlUp).Row
        For ulR = 2 To ulLast
            Dim ulBranch As String, ulBC As String, ulGL As String, ulPID As String, ulKey As String
            ulBranch = Trim(CStr(wsUL.Cells(ulR, 1).Value))
            If Len(ulBranch) >= 4 Then ulBC = Left(ulBranch, 4) Else ulBC = ulBranch
            ulGL = Trim(CStr(wsUL.Cells(ulR, 2).Value))
            ulPID = Trim(CStr(wsUL.Cells(ulR, 4).Value))
            ulKey = ulBC & "|" & ulGL & "|" & ulPID
            If ulPID <> "" And Not dictUL.Exists(ulKey) Then
                Dim ul(0 To 12) As Double
                Dim uc As Long
                For uc = 0 To 12
                    ul(uc) = 0
                    If IsNumeric(wsUL.Cells(ulR, uc + 6).Value) Then ul(uc) = CDbl(wsUL.Cells(ulR, uc + 6).Value)
                Next uc
                dictUL.Add ulKey, ul
            End If
        Next ulR
    End If
    
    ' =============================================
    ' PHASE 5: CREATE OUTPUT SHEET + HEADERS
    ' =============================================
    Set wsDest = ThisWorkbook.Sheets.Add(After:=wsSource)
    wsDest.Name = sheetName
    
    Dim dkBlue As Long, mdBlue As Long
    dkBlue = RGB(0, 54, 91): mdBlue = RGB(68, 114, 196)
    
    ' --- COLOR LEGEND (rows 1-7) ---
    wsDest.Range("S1").Value = "Color Legend"
    wsDest.Range("S1").Font.Bold = True: wsDest.Range("S1").Font.Size = 12
    wsDest.Range("S1").Font.Name = "Aptos Narrow": wsDest.Range("S1").Font.Color = dkBlue
    
    Dim lgColors As Variant, lgTexts As Variant
    lgColors = Array(RGB(255, 205, 21), RGB(255, 179, 179), RGB(218, 242, 208), _
                     RGB(220, 100, 43), RGB(193, 182, 78), RGB(246, 142, 71))
    lgTexts = Array("No PID Code - check description and reason", _
                    "Missing master data in Cost Model - populate and rerun", _
                    "PID not found in previous Cost Model. Please check if these are technology specific costs.", _
                    "Multiple absorber departments - check allocation logic", _
                    "Chargeback - verify if correct", _
                    "User Based Listing not found - add user count in User Based Listing sheet")
    Dim lg As Long
    For lg = 0 To 5
        wsDest.Cells(2 + lg, 18).Interior.Color = lgColors(lg)
        wsDest.Cells(2 + lg, 18).Borders.LineStyle = xlContinuous
        wsDest.Cells(2 + lg, 18).Borders.Weight = xlThin
        wsDest.Range(wsDest.Cells(2 + lg, 19), wsDest.Cells(2 + lg, 23)).Merge
        wsDest.Cells(2 + lg, 19).Value = lgTexts(lg)
        wsDest.Cells(2 + lg, 19).Font.Name = "Aptos Narrow": wsDest.Cells(2 + lg, 19).Font.Size = 10
    Next lg
    wsDest.Cells(3, 18).Font.Color = RGB(192, 0, 0): wsDest.Cells(3, 18).Font.Bold = True
    
    ' --- ROW 5: Title ---
    With wsDest.Range("B5")
        .Value = "Technology Asset Cost Management"
        .Font.Bold = True: .Font.Size = 16: .Font.Name = "Calibri": .Font.Color = RGB(81, 82, 84)
    End With
    wsDest.Rows(5).RowHeight = 21
    
    ' --- ROW 8: FY + instruction ---
    wsDest.Range("N8").Value = fyB3: wsDest.Range("O8").Value = fyC3
    wsDest.Range("P8").Value = fyD3: wsDest.Range("Q8").Value = fyE3
    wsDest.Range("R8").Value = "FOR DIRECT ALLOCATIONS | Show " & spreadYear & _
        " spread to departments by headcount/user listing."
    With wsDest.Range("N8:AD8")
        .Interior.Color = dkBlue: .Font.Color = vbWhite
        .Font.Bold = True: .Font.Size = 11: .Font.Name = "Aptos Narrow"
    End With
    
    ' --- ROWS 9-10: Sub-headers ---
    ' No merge - put headers directly in row 10
    wsDest.Range("R9").Value = "FOR CHARGEBACKS| Show " & spreadYear & " chargeback allocations $"
    With wsDest.Range("B9:AD9")
        .Interior.Color = dkBlue: .Font.Color = vbWhite
        .Font.Bold = True: .Font.Size = 11: .Font.Name = "Aptos Narrow"
    End With
    
    ' --- ROW 10: All column headers (single row, no merges) ---
    wsDest.Range("B10").Value = "Branch Name"
    wsDest.Range("C10").Value = "G/L Codes"
    wsDest.Range("D10").Value = "Branch Codes"
    wsDest.Range("E10").Value = "PID Codes"
    wsDest.Range("F10").Value = "GL Expense Category"
    wsDest.Range("G10").Value = "Cost Model Category"
    wsDest.Range("H10").Value = "Description"
    wsDest.Range("I10").Value = "Required or Requested"
    wsDest.Range("J10").Value = "Current Cost Model"
    wsDest.Range("K10").Value = "Allocation"
    wsDest.Range("L10").Value = "Potential Future Cost Model: If Changed"
    wsDest.Range("M10").Value = "Showback Type (None, Headcount, Consumption)"
    wsDest.Range("N10").Value = "Actuals": wsDest.Range("O10").Value = "Forecast 1"
    wsDest.Range("P10").Value = "Forecast 2": wsDest.Range("Q10").Value = "Budget"
        wsDest.Range("R10").Value = "CEO": wsDest.Range("S10").Value = "Legal"
    wsDest.Range("T10").Value = "HR": wsDest.Range("U10").Value = "Audit"
    wsDest.Range("V10").Value = "CD&O + Corp Ops": wsDest.Range("W10").Value = "Finance"
    wsDest.Range("X10").Value = "Technology": wsDest.Range("Y10").Value = "IO"
    wsDest.Range("Z10").Value = "IRR": wsDest.Range("AA10").Value = "ISR"
    wsDest.Range("AB10").Value = "CM&CI": wsDest.Range("AC10").Value = "PE"
    wsDest.Range("AD10").Value = "Comments"
    
    Dim r10d As Range
    Set r10d = Union(wsDest.Range("B10:K10"), wsDest.Range("N10:AD10"))
    With r10d
        .Interior.Color = dkBlue: .Font.Color = vbWhite: .Font.Bold = True
        .Font.Size = 11: .Font.Name = "Aptos Narrow"
        .HorizontalAlignment = xlCenter: .VerticalAlignment = xlCenter: .WrapText = True
    End With
    With wsDest.Range("L10:M10")
        .Interior.Color = mdBlue: .Font.Color = vbWhite: .Font.Bold = True
        .Font.Size = 11: .Font.Name = "Aptos Narrow"
        .HorizontalAlignment = xlCenter: .VerticalAlignment = xlCenter: .WrapText = True
    End With
    
    ' --- COLUMN WIDTHS ---
    wsDest.Columns("A").ColumnWidth = 3: wsDest.Columns("B").ColumnWidth = 18
    wsDest.Columns("C").ColumnWidth = 10.5: wsDest.Columns("D").ColumnWidth = 10
    wsDest.Columns("E").ColumnWidth = 13: wsDest.Columns("F").ColumnWidth = 18
    wsDest.Columns("G").ColumnWidth = 18: wsDest.Columns("H").ColumnWidth = 30
    wsDest.Columns("I").ColumnWidth = 16: wsDest.Columns("J").ColumnWidth = 20
    wsDest.Columns("K").ColumnWidth = 18: wsDest.Columns("L").ColumnWidth = 28
    wsDest.Columns("M").ColumnWidth = 30: wsDest.Columns("N").ColumnWidth = 14
    wsDest.Columns("O").ColumnWidth = 14: wsDest.Columns("P").ColumnWidth = 14
    wsDest.Columns("Q").ColumnWidth = 14:     Dim cw As Long
    For cw = 18 To 29: wsDest.Columns(cw).ColumnWidth = 13: Next cw
    wsDest.Columns("AD").ColumnWidth = 45
    
    ' Find spread column in output (match spreadYear to N8:Q8)
    Dim spreadCol As Long: spreadCol = 0
    Dim sc As Long
    For sc = 14 To 17
        If Trim(CStr(wsDest.Cells(8, sc).Value)) = spreadYear Then spreadCol = sc: Exit For
    Next sc
    If spreadCol = 0 Then MsgBox "'" & spreadYear & "' not found in output row 8.", vbExclamation: GoTo CleanUp
    
    ' Department name keys for matching (index 0-11)
    Dim DEPT_KEYS As Variant
    DEPT_KEYS = Array("CEO", "Legal", "HR", "Audit", "CD&O", "Finance", "Technology", "IO", "IRR", "ISR", "CM&CI", "PE")
    
    ' =============================================
    ' PHASE 6: PARSE OC DATA AND WRITE ROWS
    ' =============================================
    lastRow = wsSource.Cells(wsSource.Rows.Count, "A").End(xlUp).Row
    destRow = 11
    
    For i = 4 To lastRow
        If Not (wsSource.Cells(i, 1).IndentLevel = 3 And wsSource.Cells(i, 1).Value <> "") Then GoTo NextRow
        
        ' Skip all-zero rows
        Dim vB As Double, vC As Double, vD As Double, vE As Double
        vB = 0: vC = 0: vD = 0: vE = 0
        If IsNumeric(wsSource.Cells(i, 2).Value) Then vB = CDbl(wsSource.Cells(i, 2).Value)
        If IsNumeric(wsSource.Cells(i, 3).Value) Then vC = CDbl(wsSource.Cells(i, 3).Value)
        If IsNumeric(wsSource.Cells(i, 4).Value) Then vD = CDbl(wsSource.Cells(i, 4).Value)
        If IsNumeric(wsSource.Cells(i, 5).Value) Then vE = CDbl(wsSource.Cells(i, 5).Value)
        If vB = 0 And vC = 0 And vD = 0 And vE = 0 Then GoTo NextRow
        
        ' Parse the OC cell
        cellVal = CStr(wsSource.Cells(i, 1).Value)
        prodID = "": prodName = "": acctNum = "": acctName = "": levelCode = "": levelName = ""
        acctStart = FindAccountDash(cellVal)
        If acctStart = 0 Then GoTo NextRow
        
        productPart = Left(cellVal, acctStart - 1)
        colonPos = InStr(productPart, " : ")
        If colonPos > 0 Then
            prodID = Trim(Left(productPart, colonPos - 1))
            prodName = Trim(Mid(productPart, colonPos + 3))
        Else
            prodName = Trim(productPart)
        End If
        remainder = Mid(cellVal, acctStart + 1)
        acctNum = Left(remainder, 5)
        afterAcct = Mid(remainder, InStr(remainder, " : ") + 3)
        lastDash = FindLastLevelDash(afterAcct)
        If lastDash > 0 Then
            acctName = Trim(Left(afterAcct, lastDash - 1))
            levelPart = Mid(afterAcct, lastDash + 1)
            levelCode = Left(levelPart, 4)
            If Len(levelPart) > 5 Then levelName = Trim(Mid(levelPart, 6))
        Else
            acctName = Trim(afterAcct)
        End If
        
        ' =============================================
        ' WRITE BASE DATA
        ' =============================================
        wsDest.Cells(destRow, 2).Value = levelName      ' B
        ' Format as text to preserve leading zeros
        wsDest.Cells(destRow, 3).NumberFormat = "@"
        wsDest.Cells(destRow, 3).Value = acctNum         ' C
        wsDest.Cells(destRow, 4).NumberFormat = "@"
        wsDest.Cells(destRow, 4).Value = levelCode       ' D
        wsDest.Cells(destRow, 5).Value = prodID          ' E
        wsDest.Cells(destRow, 6).Value = acctName        ' F
        
        ' =============================================
        ' COST MODEL LOOKUP
        ' =============================================
        Dim descFromCM As Boolean: descFromCM = False
        Dim pidInCM As Boolean: pidInCM = False
        Dim missingCols As String: missingCols = ""
        Dim allocVal As String: allocVal = ""
        Dim userListVal As String: userListVal = ""
        Dim cmVals As Variant
        Dim lookupKey As String: lookupKey = levelCode & "|" & acctNum & "|" & Trim(prodID)
        
        If Trim(prodID) <> "" And dictCM.Exists(lookupKey) Then
            pidInCM = True
            cmVals = dictCM(lookupKey)
            ' H: Description
            If cmVals(0) <> "" Then
                wsDest.Cells(destRow, 8).Value = cmVals(0)
                descFromCM = True
            Else
                wsDest.Cells(destRow, 8).Value = prodName
            End If
            ' I: Required
            wsDest.Cells(destRow, 9).Value = cmVals(1)
            If cmVals(1) = "" Then missingCols = missingCols & "Required or Requested, "
            ' J: Current Cost Model
            wsDest.Cells(destRow, 10).Value = cmVals(2)
            If cmVals(2) = "" Then missingCols = missingCols & "Current Cost Model, "
            ' K: Allocation
            allocVal = cmVals(3): wsDest.Cells(destRow, 11).Value = allocVal
            ' L: Potential Future
            wsDest.Cells(destRow, 12).Value = cmVals(4)
            If cmVals(4) = "" Then missingCols = missingCols & "Potential Future Cost Model, "
            ' M: Showback
            wsDest.Cells(destRow, 13).Value = cmVals(5)
            If cmVals(5) = "" Then missingCols = missingCols & "Showback Type, "
            ' User Listing flag
            userListVal = cmVals(6)
        Else
            wsDest.Cells(destRow, 8).Value = prodName
        End If
        
        ' Amounts N-Q
        wsDest.Cells(destRow, 14).Value = wsSource.Cells(i, 2).Value: wsDest.Cells(destRow, 14).NumberFormat = "#,##0.00"
        wsDest.Cells(destRow, 15).Value = wsSource.Cells(i, 3).Value: wsDest.Cells(destRow, 15).NumberFormat = "#,##0.00"
        wsDest.Cells(destRow, 16).Value = wsSource.Cells(i, 4).Value: wsDest.Cells(destRow, 16).NumberFormat = "#,##0.00"
        wsDest.Cells(destRow, 17).Value = wsSource.Cells(i, 5).Value: wsDest.Cells(destRow, 17).NumberFormat = "#,##0.00"
        
        ' Font for all columns
        Dim col As Long
        For col = 2 To 30
            wsDest.Cells(destRow, col).Font.Name = "Aptos Narrow"
            wsDest.Cells(destRow, col).Font.Size = 11
        Next col
        
        ' Default cell colors
        Dim cg As Long
        For cg = 5 To 9: wsDest.Cells(destRow, cg).Interior.Color = RGB(217, 217, 217): Next cg
        wsDest.Cells(destRow, 10).Interior.Color = RGB(255, 255, 204)
        wsDest.Cells(destRow, 11).Interior.Color = RGB(255, 255, 204)
        Dim cy As Long
        For cy = 20 To 29: wsDest.Cells(destRow, cy).Interior.Color = RGB(255, 255, 204): Next cy
        
        ' Comments string (append throughout, write at end)
        Dim comments As String: comments = ""
        
        ' =============================================
        ' PHASE 7: ALLOCATION LOGIC
        ' =============================================
        Dim currentCM As String: currentCM = Trim(CStr(wsDest.Cells(destRow, 10).Value))
        Dim isDirectAlloc As Boolean: isDirectAlloc = (InStr(1, LCase(currentCM), "direct allocation to") > 0)
        Dim isChargeback As Boolean: isChargeback = (InStr(1, LCase(currentCM), "chargeback") > 0)
        Dim useUserList As Boolean: useUserList = (LCase(userListVal) = "cost allocated based on user listing")
        
        Dim amtToSpread As Double: amtToSpread = 0
        If IsNumeric(wsDest.Cells(destRow, spreadCol).Value) Then amtToSpread = CDbl(wsDest.Cells(destRow, spreadCol).Value)
        
        If isDirectAlloc Or isChargeback Then
            
            ' --- STEP 1: IDENTIFY ABSORBER ---
            Dim absorber As String: absorber = ""
            If isDirectAlloc Then
                absorber = Trim(Mid(currentCM, InStr(1, LCase(currentCM), "direct allocation to") + 20))
            ElseIf isChargeback Then
                absorber = "Technology"
            End If
            
            ' --- STEP 2: CHECK MULTI-ABSORBER ---
            If isDirectAlloc And InStr(absorber, ",") > 0 Then
                ' Flag: multiple absorbers
                Dim co As Long
                For co = 2 To 30: wsDest.Cells(destRow, co).Interior.Color = RGB(220, 100, 43): Next co
                comments = comments & "Check the allocation, how two departments can have a direct allocation for the same product. "
                GoTo WriteComments
            End If
            
            ' --- STEP 3: MAP ABSORBER TO INDEX ---
            Dim absIdx As Long: absIdx = -1
            Dim di As Long
            For di = 0 To 11
                If InStr(1, LCase(absorber), LCase(CStr(DEPT_KEYS(di)))) > 0 Then absIdx = di: Exit For
            Next di
            If InStr(1, LCase(absorber), "corp ops") > 0 Then absIdx = 4
            
            ' --- STEP 4: DETERMINE PARTICIPANTS FROM K ---
            Dim participants(0 To 11) As Boolean
            Dim partComment As String: partComment = ""
            Dim kIsAll As Boolean: kIsAll = (LCase(allocVal) = "all" Or allocVal = "")
            
            ' Reset participants
            For di = 0 To 11: participants(di) = False: Next di
            
            If kIsAll Then
                ' All departments participate
                For di = 0 To 11: participants(di) = True: Next di
            Else
                ' Specific departments from K
                Dim parts() As String: parts = Split(allocVal, ",")
                Dim pt As Variant
                For Each pt In parts
                    Dim ptClean As String: ptClean = Trim(CStr(pt))
                    For di = 0 To 11
                        If LCase(ptClean) = LCase(CStr(DEPT_KEYS(di))) Then participants(di) = True: Exit For
                    Next di
                    If LCase(ptClean) = "corp ops" Then participants(4) = True
                Next pt
            End If
            
            ' Flag if K is empty
            If allocVal = "" And isDirectAlloc Then
                comments = comments & "Column K (Allocation) is empty. Delete and rerun after updating Column J in Cost Model. Ignore if correct. "
            End If
            
            ' --- STEP 5: CHECK IF ABSORBER IS IN PARTICIPANT LIST ---
            Dim absInList As Boolean: absInList = False
            If absIdx >= 0 Then absInList = participants(absIdx)
            
            ' --- STEP 6: GET DEPARTMENT COUNTS (headcount or user listing) ---
            Dim deptCount(0 To 11) As Double
            For di = 0 To 11: deptCount(di) = 0: Next di
            
            Dim ulOK As Boolean: ulOK = False
            Dim hcCDO As Double, hcCorpOps As Double
            hcCDO = 0: hcCorpOps = 0
            If dictHC.Exists("CD&O") Then hcCDO = dictHC("CD&O")
            If dictHC.Exists("Corp Ops") Then hcCorpOps = dictHC("Corp Ops")
            
            If useUserList Then
                ' Try User Based Listing
                If dictUL.Exists(lookupKey) Then
                    ulOK = True
                    Dim uv As Variant: uv = dictUL(lookupKey)
                    ' Map UL (0-12) to output (0-11)
                    deptCount(0) = uv(0)            ' CEO
                    deptCount(1) = uv(1)            ' Legal
                    deptCount(2) = uv(3)            ' HR
                    deptCount(3) = uv(4)            ' Audit
                    deptCount(4) = uv(5) + uv(2)    ' CD&O + Corp Ops
                    deptCount(5) = uv(6)            ' Finance
                    deptCount(6) = uv(7)            ' Technology
                    deptCount(7) = uv(8)            ' IO
                    deptCount(8) = uv(9)            ' IRR
                    deptCount(9) = uv(12)           ' ISR
                    deptCount(10) = uv(11)          ' CM&CI
                    deptCount(11) = uv(10)          ' PE
                    
                    ' Check if ALL user counts are zero — treat as not found
                    Dim ulAllZero As Boolean: ulAllZero = True
                    Dim ulChk As Long
                    For ulChk = 0 To 11
                        If deptCount(ulChk) <> 0 Then ulAllZero = False: Exit For
                    Next ulChk
                    
                    If ulAllZero Then
                        ulOK = False
                        Dim cul2 As Long
                        For cul2 = 2 To 30: wsDest.Cells(destRow, cul2).Interior.Color = RGB(246, 142, 71): Next cul2
                        If isChargeback Then
                            comments = comments & "Chargeback - User Based Listing has no user counts for this product. Please add user count in the User Based Listing sheet and rerun, or remove 'Cost allocated based on user listing' from Cost Model column M and rerun. "
                        Else
                            comments = comments & "User Based Listing has no user counts for this product. Please add user count in the User Based Listing sheet and rerun, or remove 'Cost allocated based on user listing' from Cost Model column M and rerun. "
                        End If
                        GoTo WriteComments
                    End If
                Else
                    ' User listing not found - highlight and skip allocation
                    Dim cul As Long
                    For cul = 2 To 30: wsDest.Cells(destRow, cul).Interior.Color = RGB(246, 142, 71): Next cul
                    If isChargeback Then
                        comments = comments & "Chargeback - User Based Listing not found for this product. Please add user count in the User Based Listing sheet and rerun. "
                    Else
                        comments = comments & "User Based Listing not found for this product. Please add user count in the User Based Listing sheet and rerun. "
                    End If
                    GoTo WriteComments
                End If
            Else
                ' Use Headcount
                For di = 0 To 11
                    If di = 4 Then
                        deptCount(di) = hcCDO + hcCorpOps
                    Else
                        If dictHC.Exists(CStr(DEPT_KEYS(di))) Then deptCount(di) = dictHC(CStr(DEPT_KEYS(di)))
                    End If
                Next di
            End If
            
            ' --- STEP 6b: HANDLE CD&O/CORP OPS SPECIFICS ---
            If participants(4) And Not kIsAll Then
                Dim hasCDO As Boolean, hasCO As Boolean
                hasCDO = False: hasCO = False
                For Each pt In parts
                    If LCase(Trim(CStr(pt))) = "cd&o" Then hasCDO = True
                    If LCase(Trim(CStr(pt))) = "corp ops" Then hasCO = True
                Next pt
                If hasCDO And Not hasCO Then
                    If useUserList And ulOK Then deptCount(4) = uv(5) Else deptCount(4) = hcCDO
                    partComment = "Only CD&O allocated (not Corp Ops). "
                ElseIf hasCO And Not hasCDO Then
                    If useUserList And ulOK Then deptCount(4) = uv(2) Else deptCount(4) = hcCorpOps
                    partComment = "Only Corp Ops allocated (not CD&O). "
                End If
            End If
            
            ' --- STEP 7: CALCULATE ALLOCATIONS ---
            Dim alloc(0 To 11) As Double
            Dim totalDenom As Double, sumAlloc As Double
            For di = 0 To 11: alloc(di) = 0: Next di
            totalDenom = 0: sumAlloc = 0
            
            ' Build denominator
            ' If absorber is in participant list: include ALL participants (absorber gets ratio + residual rounding)
            ' If absorber is NOT in list: exclude absorber (it gets zero)
            For di = 0 To 11
                If participants(di) Then
                    If absInList Then
                        ' Absorber in list: everyone in denominator
                        totalDenom = totalDenom + deptCount(di)
                    Else
                        ' Absorber not in list: exclude absorber
                        If di <> absIdx Then totalDenom = totalDenom + deptCount(di)
                    End If
                End If
            Next di
            
            ' Allocate ratio shares
            If totalDenom > 0 And amtToSpread <> 0 Then
                For di = 0 To 11
                    If participants(di) And di <> absIdx Then
                        alloc(di) = (deptCount(di) / totalDenom) * amtToSpread
                        sumAlloc = sumAlloc + alloc(di)
                    End If
                Next di
                
                ' Absorber gets residual IF it's in the participant list
                If absIdx >= 0 And absInList Then
                    alloc(absIdx) = amtToSpread - sumAlloc
                End If
            End If
            
            ' --- STEP 8: WRITE ALLOCATIONS TO DEPT COLUMNS ---
            For di = 0 To 11
                If participants(di) Then
                    wsDest.Cells(destRow, 18 + di).Value = alloc(di)
                    wsDest.Cells(destRow, 18 + di).NumberFormat = "#,##0.00"
                End If
            Next di
            
            If partComment <> "" Then comments = comments & partComment
            
            ' --- STEP 9: CHARGEBACK HIGHLIGHT ---
            If isChargeback Then
                Dim cb As Long
                For cb = 2 To 30: wsDest.Cells(destRow, cb).Interior.Color = RGB(193, 182, 78): Next cb
                comments = comments & "Check chargebacks, if correct. "
            End If
            
        ElseIf currentCM = "" And pidInCM Then
            comments = comments & "Current Cost Model doesn't have data. "
        End If
        
WriteComments:
        ' =============================================
        ' PHASE 8: ROW HIGHLIGHTS (priority order)
        ' =============================================
        If Trim(prodID) = "" Then
            Dim ch As Long
            For ch = 2 To 30: wsDest.Cells(destRow, ch).Interior.Color = RGB(255, 205, 21): Next ch
            comments = "Check the description and reason for no PD code. "
        ElseIf pidInCM And missingCols <> "" Then
            missingCols = Left(missingCols, Len(missingCols) - 2)
            Dim cr As Long
            For cr = 2 To 30
                wsDest.Cells(destRow, cr).Interior.Color = RGB(255, 179, 179)
                wsDest.Cells(destRow, cr).Font.Color = RGB(192, 0, 0)
                wsDest.Cells(destRow, cr).Font.Bold = True
            Next cr
            comments = comments & "Missing in Cost Model: " & missingCols & ". Please populate the master data. "
        ElseIf Not descFromCM And Trim(prodID) <> "" And Not pidInCM Then
            Dim cGrn As Long
            For cGrn = 2 To 30: wsDest.Cells(destRow, cGrn).Interior.Color = RGB(218, 242, 208): Next cGrn
            comments = comments & "PID not found in previous Cost Model. Please check if these are technology specific costs. "
        End If
        
        ' Write comments to R (col 18)
        If comments <> "" Then wsDest.Cells(destRow, 30).Value = comments
        
        destRow = destRow + 1
        
NextRow:
    Next i
    
    ' =============================================
    ' PHASE 9: FINALIZE OUTPUT SHEET
    ' =============================================
    
    ' Add helper column right after Comments (AD=30), so AE=31
    ' Write PID_Description header and data
    Dim helperCol As Long
    helperCol = 31  ' AE, right after AD (Comments)
    wsDest.Cells(10, helperCol).Value = "PID_Description"
    wsDest.Cells(10, helperCol).Interior.Color = dkBlue
    wsDest.Cells(10, helperCol).Font.Color = vbWhite
    wsDest.Cells(10, helperCol).Font.Bold = True
    wsDest.Cells(10, helperCol).Font.Size = 11
    wsDest.Cells(10, helperCol).Font.Name = "Aptos Narrow"
    wsDest.Columns(helperCol).ColumnWidth = 35
    
    Dim rr As Long
    For rr = 11 To destRow - 1
        ' Check if any department column (R=18 to AC=29) has a non-zero value
        Dim hasValue As Boolean: hasValue = False
        Dim dc As Long
        For dc = 18 To 29
            If IsNumeric(wsDest.Cells(rr, dc).Value) Then
                If CDbl(wsDest.Cells(rr, dc).Value) <> 0 Then hasValue = True: Exit For
            End If
        Next dc
        
        If hasValue Then
            Dim pidVal As String, descVal As String
            pidVal = Trim(CStr(wsDest.Cells(rr, 5).Value))   ' E = PID
            descVal = Trim(CStr(wsDest.Cells(rr, 8).Value))  ' H = Description
            If pidVal <> "" Then
                wsDest.Cells(rr, helperCol).Value = pidVal & "_" & descVal
            Else
                wsDest.Cells(rr, helperCol).Value = descVal
            End If
        End If
        ' Leave blank if all dept columns are zero — pivot will show as "(blank)" which we filter out
        wsDest.Cells(rr, helperCol).Font.Name = "Aptos Narrow"
        wsDest.Cells(rr, helperCol).Font.Size = 11
    Next rr
    
    ' DON'T hide helper column yet - pivot needs to find it first
    
    wsDest.Activate
    ActiveWindow.Zoom = 70
    wsDest.Range("B11").Select
    ActiveWindow.FreezePanes = True
    If destRow > 11 Then wsDest.Range("B10:AD" & destRow - 1).AutoFilter
    
    ' =============================================
    ' PHASE 10: CREATE PIVOT TABLE
    ' =============================================
    Dim pivotSheetName As String
    pivotSheetName = fiscalYear & " Pivot"
    If Len(pivotSheetName) > 31 Then pivotSheetName = Left(pivotSheetName, 31)
    
    ' Delete existing pivot sheet
    Dim wsPivotCheck As Worksheet
    On Error Resume Next: Set wsPivotCheck = ThisWorkbook.Sheets(pivotSheetName): On Error GoTo 0
    If Not wsPivotCheck Is Nothing Then
        Application.DisplayAlerts = False: wsPivotCheck.Delete: Application.DisplayAlerts = True
    End If
    
    Dim wsPivot As Worksheet
    Set wsPivot = ThisWorkbook.Sheets.Add(After:=wsDest)
    wsPivot.Name = pivotSheetName
    
    ' Dynamically find last column with header in row 10
    Dim lastPivotCol As Long
    lastPivotCol = wsDest.Cells(10, wsDest.Columns.Count).End(xlToLeft).Column
    
    ' Define source data dynamically: row 10 to last data row, col B to last header column
    Dim srcRange As Range
    Set srcRange = wsDest.Range(wsDest.Cells(10, 2), wsDest.Cells(destRow - 1, lastPivotCol))
    
    ' Activate source sheet and select source range first
    wsDest.Activate
    srcRange.Select
    
    ' Create pivot via ActiveWorkbook method
    Dim pvtName As String
    pvtName = "Pivot" & Format(Now, "hhmmss")
    
    ActiveWorkbook.PivotCaches.Create( _
        SourceType:=xlDatabase, _
        SourceData:=srcRange _
    ).CreatePivotTable _
        TableDestination:=wsPivot.Range("A3"), _
        TableName:=pvtName
    
    Dim pvt As PivotTable
    Set pvt = wsPivot.PivotTables(pvtName)
    
    ' Set modern tabular layout (not classic)
    pvt.RowAxisLayout xlTabularRow
    pvt.ShowTableStyleRowStripes = True
    pvt.TableStyle2 = "PivotStyleMedium9"
    
    ' Remove subtotals and grand totals for cleaner look
    pvt.ColumnGrand = True
    pvt.RowGrand = True
    
    ' Configure pivot fields
    ' Row: PID_Description
    With pvt.PivotFields("PID_Description")
        .Orientation = xlRowField
        .Position = 1
    End With
    
    ' Values: First add Actuals (column N) so user sees what was allocated
    On Error Resume Next
    With pvt.PivotFields("Actuals")
        .Orientation = xlDataField
        .Function = xlSum
        .NumberFormat = "#,##0.00"
        .Name = "Total Amount"
    End With
    On Error GoTo 0
    
    ' Values: Department columns
    Dim deptHeaders As Variant
    deptHeaders = Array("CEO", "Legal", "HR", "Audit", "CD&O + Corp Ops", _
                        "Finance", "Technology", "IO", "IRR", "ISR", "CM&CI", "PE")
    Dim dh As Variant
    For Each dh In deptHeaders
        On Error Resume Next
        With pvt.PivotFields(CStr(dh))
            .Orientation = xlDataField
            .Function = xlSum
            .NumberFormat = "#,##0.00"
            .Name = "Sum of " & CStr(dh)
        End With
        On Error GoTo 0
    Next dh
    
    ' If multiple data fields, put them in columns
    If pvt.DataFields.Count > 1 Then
        pvt.DataPivotField.Orientation = xlColumnField
    End If
    
    ' --- FILTER OUT BLANK AND ALL-ZERO ROWS ---
    ' Hide PID_Description items that are blank or "(blank)"
    Dim pi As PivotItem
    On Error Resume Next
    With pvt.PivotFields("PID_Description")
        .AutoSort xlManual, .SourceName
        For Each pi In .PivotItems
            Dim itemName As String
            itemName = Trim(CStr(pi.Name))
            If itemName = "" Or itemName = "(blank)" Or itemName = "0" Then
                pi.Visible = False
            End If
        Next pi
        .AutoSort xlAscending, .SourceName
    End With
    On Error GoTo 0
    
    ' Refresh to apply
    pvt.RefreshTable
    
    ' Filter fields (for slicers)
    With pvt.PivotFields("Showback Type (None, Headcount, Consumption)")
        .Orientation = xlPageField
    End With
    With pvt.PivotFields("Current Cost Model")
        .Orientation = xlPageField
    End With
    
    ' --- ADD SLICERS (positioned to the right of pivot data, BCI Format style) ---
    Dim slicerCache1 As SlicerCache
    Dim slicerCache2 As SlicerCache
    
    ' Find the right edge of the pivot to position slicers
    Dim slicerLeft As Double
    On Error Resume Next
    slicerLeft = wsPivot.Cells(4, pvt.DataBodyRange.Columns.Count + pvt.DataBodyRange.Column + 1).Left + 20
    If slicerLeft = 0 Or Err.Number <> 0 Then slicerLeft = 1200
    Err.Clear
    
    ' Current Cost Model - TOP
    Set slicerCache2 = ThisWorkbook.SlicerCaches.Add2(pvt, "Current Cost Model")
    If Not slicerCache2 Is Nothing Then
        Dim slicer2 As Slicer
        Set slicer2 = slicerCache2.Slicers.Add(wsPivot, , "CostModelSlicer", _
            "Current Cost Model", 10, slicerLeft, 250, 200)
        slicer2.Style = "BCI Format"
    End If
    
    ' Showback Type - BELOW
    Set slicerCache1 = ThisWorkbook.SlicerCaches.Add2(pvt, "Showback Type (None, Headcount, Consumption)")
    If Not slicerCache1 Is Nothing Then
        Dim slicer1 As Slicer
        Set slicer1 = slicerCache1.Slicers.Add(wsPivot, , "ShowbackSlicer", _
            "Showback Type", 220, slicerLeft, 250, 220)
        slicer1.Style = "BCI Format"
    End If
    On Error GoTo 0
    
    ' Deselect slicers by selecting a cell (removes cross cursor)
    wsPivot.Activate
    wsPivot.Range("A1").Select
    ActiveWindow.Zoom = 70
    
    ' Title
    wsPivot.Range("A1").Value = "Cost Allocation Pivot - " & fiscalYear
    wsPivot.Range("A1").Font.Bold = True
    wsPivot.Range("A1").Font.Size = 14
    wsPivot.Range("A1").Font.Name = "Aptos Narrow"
    wsPivot.Range("A1").Font.Color = dkBlue
    
    ' Now hide the helper column on the output sheet
    wsDest.Columns(helperCol).Hidden = True
    
    MsgBox "Done! Created:" & vbCrLf & _
           "  1. '" & sheetName & "' with " & destRow - 11 & " rows" & vbCrLf & _
           "  2. '" & pivotSheetName & "' with pivot table and slicers" & vbCrLf & _
           "Spread: " & spreadYear, vbInformation

CleanUp:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
End Sub

' ============================================================
' CreateButtonAndTextBox - Run ONCE
' ============================================================
Sub CreateButtonAndTextBox()
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Sheets("OC Data Refresh"): On Error GoTo 0
    If ws Is Nothing Then MsgBox "OC Data Refresh not found!", vbCritical: Exit Sub
    On Error Resume Next: ws.Buttons("btnGenerate").Delete: On Error GoTo 0
    
    ws.Cells(1, 7).Value = "Enter Fiscal Year:"
    ws.Cells(1, 7).Font.Bold = True: ws.Cells(1, 7).Font.Size = 11: ws.Cells(1, 7).Font.Name = "Arial"
    With ws.Range("H1")
        .Value = "F2026": .Font.Size = 12: .Font.Bold = True: .Font.Name = "Arial"
        .Borders.LineStyle = xlContinuous: .Borders.Weight = xlMedium
        .Borders.Color = RGB(0, 54, 91): .HorizontalAlignment = xlCenter
    End With
    
    ws.Cells(1, 9).Value = "Spread FY (e.g. FY2026):"
    ws.Cells(1, 9).Font.Bold = True: ws.Cells(1, 9).Font.Size = 11: ws.Cells(1, 9).Font.Name = "Arial"
    With ws.Range("J1")
        .Value = "FY2026": .Font.Size = 12: .Font.Bold = True: .Font.Name = "Arial"
        .Borders.LineStyle = xlContinuous: .Borders.Weight = xlMedium
        .Borders.Color = RGB(0, 54, 91): .HorizontalAlignment = xlCenter
    End With
    
    Dim btn As Object
    Set btn = ws.Buttons.Add(Left:=ws.Range("K1").Left + 10, Top:=ws.Range("K1").Top, Width:=200, Height:=26)
    btn.OnAction = "ParseOCToManagementTab"
    btn.Characters.Text = "Generate Management Tab"
    btn.Characters.Font.Size = 11: btn.Characters.Font.Bold = True: btn.Name = "btnGenerate"
    
    MsgBox "Setup: H1=Tab name, J1=Spread FY. Click button to generate.", vbInformation
End Sub

' ============================================================
' HELPER FUNCTIONS
' ============================================================
Function FindAccountDash(ByVal s As String) As Long
    Dim p As Long, nc As String: p = 1
    Do
        p = InStr(p, s, "-")
        If p = 0 Or p >= Len(s) - 5 Then FindAccountDash = 0: Exit Function
        nc = Mid(s, p + 1, 5)
        If IsNumStr(nc) Then
            If Mid(s, p + 6, 3) = " : " Then FindAccountDash = p: Exit Function
        End If
        p = p + 1
    Loop
    FindAccountDash = 0
End Function

Function FindLastLevelDash(ByVal s As String) As Long
    Dim p As Long, lf As Long, nc As String: lf = 0: p = 1
    Do
        p = InStr(p, s, "-")
        If p = 0 Or p >= Len(s) - 4 Then Exit Do
        nc = Mid(s, p + 1, 4)
        If IsNumStr(nc) Then
            If Mid(s, p + 5, 1) = " " Then lf = p
        End If
        p = p + 1
    Loop
    FindLastLevelDash = lf
End Function

Function IsNumStr(ByVal s As String) As Boolean
    Dim j As Long
    If Len(s) = 0 Then IsNumStr = False: Exit Function
    For j = 1 To Len(s)
        If Mid(s, j, 1) < "0" Or Mid(s, j, 1) > "9" Then IsNumStr = False: Exit Function
    Next j
    IsNumStr = True
End Function

