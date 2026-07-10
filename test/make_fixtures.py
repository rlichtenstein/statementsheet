"""Generate synthetic bank statement PDFs in 4 distinct real-world layouts, with ground-truth JSON."""
import json, random, os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(__file__), 'fixtures')
random.seed(42)
MERCHANTS = ["STARBUCKS #4821 BOSTON MA","SHELL OIL 5744 CAMBRIDGE","AMAZON MKTPLACE PMTS","WHOLEFDS BOS 10245","MBTA CHARLIE CARD","NETFLIX.COM","VERIZON WIRELESS PMT","BLUE CROSS PREMIUM","TJX COS #602 FRAMINGHAM","DUNKIN #341552 QUINCY MA","UBER TRIP HELP.UBER.COM","CVS/PHARMACY #01342","DELTA AIR 0062341985542","MARRIOTT BOSTON COPLEY","LEGAL SEA FOODS #14","ZIPCAR INC","COMCAST CABLE COMM","PELOTON MEMBERSHIP","HARVARD BOOK STORE","SWEETGREEN BOSTON"]
DEPOSITS = ["DIRECT DEP ACME CONSULTING PAYROLL","MOBILE CHECK DEPOSIT","ZELLE FROM JORDAN M","INTEREST PAYMENT","TRANSFER FROM SAVINGS ...4472"]

def money(c): 
    s = "-" if c < 0 else ""
    a = abs(c); return f"{s}{a//100:,}.{a%100:02d}"

def gen_txs(n, opening, months=("04",), year=2026, card=False):
    txs, bal = [], opening
    day = 1
    for i in range(n):
        day = min(day + random.choice([0,1,1,2]), 30)
        if not card and random.random() < 0.22:
            amt = random.randint(20000, 480000)
            desc = random.choice(DEPOSITS)
        else:
            amt = -random.randint(450, 28000)
            desc = random.choice(MERCHANTS)
        if card: amt = -amt  # card: purchases positive (increase amount owed)
        bal += amt
        txs.append({"date": f"{year}-{months[0]}-{day:02d}", "desc": desc, "amount": amt, "balance": bal})
    return txs, bal

def header_footer(c, page, bank, acct):
    c.setFont("Helvetica-Bold", 10); c.drawString(50, 760, bank)
    c.setFont("Helvetica", 8)
    c.drawString(50, 748, f"Account Number: ****{acct}   Statement Period: 04/01/2026 - 04/30/2026")
    c.drawString(50, 30, f"{bank} | Member FDIC | Page {page}")

# Layout A: checking, single signed Amount column + Balance column (Chase-ish)
def layout_a():
    opening = 532477
    txs, closing = gen_txs(58, opening)
    path = os.path.join(OUT, "stmt_a_checking_balancecol.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1; y = 700
    header_footer(c, page, "FIRST COMMONWEALTH BANK", "7731")
    c.setFont("Helvetica", 9); c.drawString(50, 726, f"Beginning Balance on 04/01/2026    ${money(opening)}")
    c.setFont("Helvetica-Bold", 9)
    for x, t in [(50,"Date"),(110,"Description"),(420,"Amount"),(500,"Balance")]: c.drawString(x, y, t)
    y -= 14; c.setFont("Helvetica", 8)
    for t in txs:
        if y < 60:
            c.showPage(); page += 1; header_footer(c, page, "FIRST COMMONWEALTH BANK", "7731")
            y = 700; c.setFont("Helvetica", 8)
        mm, dd = t["date"][5:7], t["date"][8:10]
        c.drawString(50, y, f"{mm}/{dd}"); c.drawString(110, y, t["desc"][:52])
        c.drawRightString(470, y, money(t["amount"])); c.drawRightString(560, y, money(t["balance"]))
        y -= 12
    c.setFont("Helvetica-Bold", 9); c.drawString(50, y-10, f"Ending Balance on 04/30/2026    ${money(closing)}")
    c.save()
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"checking", "txs": txs}

# Layout B: checking, separate Deposits/Withdrawals sections, unsigned amounts (BofA-ish)
def layout_b():
    opening = 1204488
    txs, closing = gen_txs(44, opening)
    path = os.path.join(OUT, "stmt_b_checking_sections.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1
    header_footer(c, page, "BAYSTATE NATIONAL BANK", "2209")
    c.setFont("Helvetica", 9)
    c.drawString(50, 726, f"Previous Balance    ${money(opening)}")
    c.drawString(300, 726, f"New Balance    ${money(closing)}")
    y = 700
    deps = [t for t in txs if t["amount"] > 0]; wds = [t for t in txs if t["amount"] < 0]
    for title, group in [("Deposits and Other Credits", deps), ("Withdrawals and Other Debits", wds)]:
        c.setFont("Helvetica-Bold", 10); c.drawString(50, y, title); y -= 16; c.setFont("Helvetica", 8)
        for t in group:
            if y < 60:
                c.showPage(); page += 1; header_footer(c, page, "BAYSTATE NATIONAL BANK", "2209"); y = 700; c.setFont("Helvetica", 8)
            mm, dd = t["date"][5:7], t["date"][8:10]
            c.drawString(50, y, f"{mm}/{dd}/2026"); c.drawString(130, y, t["desc"][:55])
            c.drawRightString(540, y, money(abs(t["amount"]))); y -= 12
        y -= 10
    c.save()
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"checking", "txs": txs}

# Layout C: credit card, no balance column, purchases positive, CR for credits (Amex-ish)
def layout_c():
    opening = 184230  # amount owed
    txs, closing = gen_txs(37, opening, card=True)
    path = os.path.join(OUT, "stmt_c_creditcard.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1
    header_footer(c, page, "MERIDIAN CARD SERVICES", "9016")
    c.setFont("Helvetica", 9)
    c.drawString(50, 726, f"Previous Balance    ${money(opening)}")
    c.drawString(300, 726, f"New Balance    ${money(closing)}")
    y = 696; c.setFont("Helvetica-Bold", 10); c.drawString(50, y, "Payments and Other Credits"); y -= 16; c.setFont("Helvetica", 8)
    creds = [t for t in txs if t["amount"] < 0]; purch = [t for t in txs if t["amount"] >= 0]
    for t in creds:
        mm, dd = t["date"][5:7], t["date"][8:10]
        c.drawString(50, y, f"Apr {int(dd)}"); c.drawString(130, y, (t["desc"][:50] if t["desc"] not in DEPOSITS else "ONLINE PAYMENT - THANK YOU"))
        c.drawRightString(540, y, money(abs(t["amount"])) + " CR"); y -= 12
    y -= 8; c.setFont("Helvetica-Bold", 10); c.drawString(50, y, "Purchases and Charges"); y -= 16; c.setFont("Helvetica", 8)
    for t in purch:
        if y < 60:
            c.showPage(); page += 1; header_footer(c, page, "MERIDIAN CARD SERVICES", "9016"); y = 700; c.setFont("Helvetica", 8)
        mm, dd = t["date"][5:7], t["date"][8:10]
        c.drawString(50, y, f"Apr {int(dd)}"); c.drawString(130, y, t["desc"][:55])
        c.drawRightString(540, y, money(t["amount"])); y -= 12
    c.save()
    # ground truth in "signed cash flow" convention: purchases negative
    gt = [{**t, "amount": -t["amount"], "balance": None} for t in txs]
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"card", "txs": gt}

# Layout D: checking with multi-line descriptions and noisy footers
def layout_d():
    opening = 88012
    txs, closing = gen_txs(26, opening)
    path = os.path.join(OUT, "stmt_d_multiline.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1
    header_footer(c, page, "GRANITE TRUST", "5583")
    c.setFont("Helvetica", 9); c.drawString(50, 726, f"Opening Balance    ${money(opening)}")
    y = 700; c.setFont("Helvetica", 8)
    for t in txs:
        if y < 80:
            c.showPage(); page += 1; header_footer(c, page, "GRANITE TRUST", "5583"); y = 700; c.setFont("Helvetica", 8)
        mm, dd = t["date"][5:7], t["date"][8:10]
        c.drawString(50, y, f"{mm}/{dd}"); c.drawString(100, y, t["desc"][:34])
        c.drawRightString(470, y, money(t["amount"])); c.drawRightString(560, y, money(t["balance"]))
        y -= 10
        c.drawString(100, y, "REF #" + str(random.randint(10**9, 10**10)))  # continuation line
        y -= 12
    c.setFont("Helvetica", 9); c.drawString(50, y-8, f"Closing Balance    ${money(closing)}")
    c.save()
    gt = [{**t, "desc": t["desc"][:34].strip()} for t in txs]
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"checking", "txs": gt}


# Layout E: checking, balance column, NO year on tx dates, year-trap check numbers.
# Statement period (the only real year source) lives in a header that repeats on
# every page, so naive header-stripping loses it. Mirrors a real 2026 Chase layout
# that exposed a year-hint bug (check number 2007 mistaken for the year).
def layout_e():
    opening = 6165148
    txs, closing = gen_txs(60, opening, months=("06",), year=2026)
    txs[1]["desc"] = "CHECK # 2007"; txs[1]["amount"] = -abs(txs[1]["amount"])
    txs[3]["desc"] = "CHECK # 2011"; txs[3]["amount"] = -abs(txs[3]["amount"])
    # rebuild running balances after desc/amount tweaks
    bal = opening
    for t in txs: bal += t["amount"]; t["balance"] = bal
    closing = bal
    path = os.path.join(OUT, "stmt_e_checknum_yeartrap.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1; y = 700
    def hf(page_no):
        c.setFont("Helvetica-Bold", 10); c.drawString(50, 760, "HARBORSTONE BANK")
        c.setFont("Helvetica", 8)
        c.drawString(50, 748, "Account Number: ****4410   Statement Period: 05/13/2026 - 06/12/2026")
        c.drawString(50, 30, f"HARBORSTONE BANK | Member FDIC | Est. 1919 | Page {page_no}")
    hf(page)
    c.setFont("Helvetica", 9); c.drawString(50, 726, f"Beginning Balance    ${money(opening)}")
    c.setFont("Helvetica-Bold", 9)
    for x, t in [(50,"Date"),(110,"Description"),(420,"Amount"),(500,"Balance")]: c.drawString(x, y, t)
    y -= 14; c.setFont("Helvetica", 8)
    for t in txs:
        if y < 60:
            c.showPage(); page += 1; hf(page); y = 700; c.setFont("Helvetica", 8)
        mm, dd = t["date"][5:7], t["date"][8:10]
        c.drawString(50, y, f"{mm}/{dd}"); c.drawString(110, y, t["desc"][:52])
        c.drawRightString(470, y, money(t["amount"])); c.drawRightString(560, y, money(t["balance"]))
        y -= 12
    c.setFont("Helvetica-Bold", 9); c.drawString(50, y-10, f"Ending Balance    ${money(closing)}")
    c.save()
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"checking", "txs": txs}


# Layout F: credit card, WF-style. Rows in purchase/credit sections lead with the
# card's last-4 BEFORE the date ("1234 06/01 06/02 REF DESC 6.45"), payments rows
# lead with a trans/post date PAIR, amounts unsigned in Credits/Charges columns
# (sign implied by section), sections: Payments / Other Credits / Purchases / Fees /
# Interest Charged. Continuation detail lines, one starting with a full MM/DD/YY date.
def layout_f():
    opening = 1602629  # amount owed
    txs = []           # cash convention: payments/credits +, purchases/fees -
    txs.append({"date":"2026-05-28","desc":"ONLINE PAYMENT THANK YOU","amount":120000,"balance":None,"sec":"pay"})
    txs.append({"date":"2026-06-15","desc":"ONLINE PAYMENT THANK YOU","amount":80000,"balance":None,"sec":"pay"})
    txs.append({"date":"2026-05-30","desc":"REFUND ACME STORE","amount":5500,"balance":None,"sec":"cred"})
    txs.append({"date":"2026-06-08","desc":"REFUND HARVARD BOOK STORE","amount":2249,"balance":None,"sec":"cred"})
    day = 27; random.seed(77)
    for i in range(40):
        day += random.choice([0,1,1])
        mm, dd = ("05", day) if day <= 31 else ("06", day-31)
        desc = random.choice(MERCHANTS)
        txs.append({"date":f"2026-{mm}-{dd:02d}","desc":desc,"amount":-random.randint(300,26000),"balance":None,"sec":"pur"})
    txs.append({"date":"2026-06-20","desc":"LATE FEE","amount":-2500,"balance":None,"sec":"fee"})
    closing = opening - sum(t["amount"] for t in txs)
    path = os.path.join(OUT, "stmt_f_card_wf_style.pdf")
    c = canvas.Canvas(path, pagesize=letter); page = 1
    def hf(pg):
        c.setFont("Helvetica-Bold", 10); c.drawString(50, 760, "WELLS RIVER CARD SERVICES")
        c.setFont("Helvetica", 8)
        c.drawString(50, 748, "Account ending in 9944   Statement Period 05/27/2026 to 06/26/2026")
        c.drawString(50, 738, "Card Trans Post Reference Number Description Credits Charges")
        c.drawString(50, 30, f"9944 QRZ 1 07 26 000482 1 PAGE {pg} of 3 06 3921 0000")
    hf(page)
    c.setFont("Helvetica", 9)
    c.drawString(50, 722, f"Previous Balance    ${money(opening)}    Total Credit Limit    $30,000")
    c.drawString(50, 710, f"New Balance    ${money(closing)}")
    c.drawString(50, 698, "Rewards balance as of: 06/26/2026    $214.55")
    y = [676]
    def emit(txt, x=50, bold=False, right=None):
        if y[0] < 60:
            c.showPage(); nonlocal_page[0] += 1; hf(nonlocal_page[0]); y[0] = 700; c.setFont("Helvetica", 8)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 8 if not bold else 9)
        if right is not None: c.drawRightString(right, y[0], txt)
        else: c.drawString(x, y[0], txt)
    nonlocal_page = [1]
    def newline(dy=12): y[0] -= dy
    def md(t): return t["date"][5:7] + "/" + t["date"][8:10]
    def post(t):
        d = int(t["date"][8:10]) + 1
        mm = t["date"][5:7]
        if (mm == "05" and d > 31) or (mm == "06" and d > 30): return ("06" if mm=="05" else "07") + "/01"
        return f"{mm}/{d:02d}"
    ref = lambda: str(random.randint(10**14, 10**15-1))
    # Payments
    emit("Payments", bold=True); newline(14)
    for t in [x for x in txs if x["sec"]=="pay"]:
        emit(f"{md(t)} {post(t)} {t['desc']}"); emit(money(t["amount"]), right=480); newline()
    emit(f"TOTAL PAYMENTS FOR THIS PERIOD ${money(sum(t['amount'] for t in txs if t['sec']=='pay'))}", bold=True); newline(16)
    # Other Credits
    emit("Other Credits", bold=True); newline(14)
    for t in [x for x in txs if x["sec"]=="cred"]:
        emit(f"9944 {md(t)} {post(t)} {ref()} {t['desc']}"); emit(money(t["amount"]), right=480); newline()
    emit(f"TOTAL OTHER CREDITS FOR THIS PERIOD ${money(sum(t['amount'] for t in txs if t['sec']=='cred'))}", bold=True); newline(16)
    # Purchases
    emit("Purchases, Balance Transfers & Other Charges", bold=True); newline(14)
    for i, t in enumerate([x for x in txs if x["sec"]=="pur"]):
        emit(f"9944 {md(t)} {post(t)} {ref()} {t['desc'][:40]}"); emit(money(-t["amount"]), right=560); newline()
        if i % 7 == 3:
            emit("RECURRING PAYMENT", x=70); newline()
        if i == 10:
            emit(f"{md(t)}/26 FOREIGN TRANSACTION DETAIL", x=70); newline()
    emit(f"TOTAL PURCHASES, BALANCE TRANSFERS & OTHER CHARGES FOR THIS PERIOD ${money(-sum(t['amount'] for t in txs if t['sec']=='pur'))}", bold=True); newline(16)
    # Fees
    emit("Fees", bold=True); newline(14)
    for t in [x for x in txs if x["sec"]=="fee"]:
        emit(f"9944 {md(t)} {post(t)} {ref()} {t['desc']}"); emit(money(-t["amount"]), right=560); newline()
    emit(f"TOTAL FEES CHARGED FOR THIS PERIOD ${money(-sum(t['amount'] for t in txs if t['sec']=='fee'))}", bold=True); newline(16)
    # Interest
    emit("Interest Charged", bold=True); newline(14)
    emit("INTEREST CHARGE ON PURCHASES 0.00"); newline()
    emit("TOTAL INTEREST CHARGED FOR THIS PERIOD $0.00", bold=True); newline()
    c.save()
    gt = [{k: t[k] for k in ("date","desc","amount","balance")} for t in txs]
    return {"file": os.path.basename(path), "opening": opening, "closing": closing, "kind":"card", "txs": gt}

os.makedirs(OUT, exist_ok=True)
truth = [layout_a(), layout_b(), layout_c(), layout_d(), layout_e(), layout_f()]
with open(os.path.join(OUT, "ground_truth.json"), "w") as f:
    json.dump(truth, f, indent=1)
print("fixtures:", [t["file"] for t in truth])
print("tx counts:", [len(t["txs"]) for t in truth])
