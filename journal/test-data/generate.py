import os, json, random, datetime as dt
HERE=os.path.dirname(os.path.abspath(__file__))
random.seed(11)

RISK = 0.5                      # % of each account per trade
ACCOUNTS = [
  {"id":"ac_smc_25k",  "name":"FTMO 25K",        "size":25000,  "phase":"Funded",
   "basePnl":0, "objective":"Consistent 1-2% a month, no breach.",
   "rules":"Max 5% daily loss, 10% overall. Risk 0.5% a trade, two trades a day.",
   "profitTarget":None, "maxDD":2500, "minDays":None},
  {"id":"ac_smc_50k",  "name":"Funding Pips 50K","size":50000,  "phase":"Funded",
   "basePnl":0, "objective":"Compound the funded balance, withdraw quarterly.",
   "rules":"Max 4% daily loss, 8% overall. Risk 0.5% a trade.",
   "profitTarget":None, "maxDD":4000, "minDays":None},
  {"id":"ac_smc_100k", "name":"Alpha Capital 100K","size":100000,"phase":"Funded",
   "basePnl":0, "objective":"Largest account — protect it, no exceptions.",
   "rules":"Max 5% daily loss, 10% overall. Risk 0.5% a trade, London and NY only.",
   "profitTarget":None, "maxDD":10000, "minDays":None},
]
ACCT_REF = [{"id":a["id"],"name":a["name"],"size":a["size"],"phase":a["phase"],"risk":RISK} for a in ACCOUNTS]
TOTAL_SIZE = sum(a["size"] for a in ACCOUNTS)

SETUPS = [
  ("Liquidity sweep → CHoCH",
   "Price runs the obvious high or low, then breaks structure against the move on the entry timeframe.",
   "Wait for the sweep. Wait for the CHoCH. Enter on the first pullback into the origin of the break — not the sweep candle itself. Stop beyond the sweep wick, target the opposing liquidity pool."),
  ("HTF order block mitigation",
   "The 4H or Daily order block that caused the last displacement, tapped for the first time.",
   "Mark the last down candle before an up move (or the reverse). Trade it only in line with Daily bias and only on the first tap. Stop beyond the block, first target the nearest FVG."),
  ("Fair value gap continuation",
   "A trend pullback into an unmitigated imbalance left by the impulse.",
   "The FVG must be unmitigated and inside a discount (long) or premium (short). Enter on the 50% of the gap. Stop below the gap origin, target the prior high."),
  ("Breaker block",
   "An order block that failed, was traded through, and now acts as resistance turned support.",
   "Needs the block to have been violated with displacement, not drifted through. Enter on the retest from the other side. Stop beyond the block body."),
  ("Inducement → OTE",
   "Minor liquidity taken below the pullback, then entry in the 62-79% retracement of the leg.",
   "The inducement must be taken before entry, otherwise it is still coming. Enter in the OTE zone, stop beyond the swing that produced the leg."),
]
CONFLUENCES = [
  ("HTF bias aligned",          "Daily and 4H both point the same way as the trade.", True),
  ("Liquidity swept first",     "An obvious high, low or equal pair was taken before entry.", True),
  ("CHoCH on entry timeframe",  "Structure broke against the prior leg on 5m or 15m.", True),
  ("Unmitigated FVG in the path","An imbalance is left open between entry and target.", False),
  ("Premium / discount respected","Shorts sold in premium, longs bought in discount of the dealing range.", True),
  ("Killzone timing",           "Entry inside the London or New York open window.", False),
  ("SMT divergence",            "The correlated pair failed to make the matching high or low.", False),
  ("Clean draw on liquidity",   "An obvious pool sits between entry and the target.", False),
]
CF_IDS = ["cf_smc_%02d"%i for i in range(len(CONFLUENCES))]

PAIRS = ["EURUSD","GBPUSD","GBPJPY","XAUUSD","USDJPY","EURJPY","NAS100","AUDUSD","US30","EURGBP"]
SESSIONS = ["London","New York"]
TFS = ["5m","15m"]

MISTAKES = ["Entered before the sweep","No CHoCH confirmation","Against HTF bias",
            "Chased the displacement","Moved stop","Closed early"]
WHY = {
 "Entered before the sweep":"Saw the level and wanted the fill. The pool above was still untouched.",
 "No CHoCH confirmation":"Assumed the reversal from the reaction alone.",
 "Against HTF bias":"Took a clean 15m setup while the Daily was still pushing the other way.",
 "Chased the displacement":"Entered mid-leg instead of waiting for the pullback into the origin.",
 "Moved stop":"Pulled the stop to break-even on a normal retrace and got taken out before the run.",
 "Closed early":"Took a third of the target because the position was green and I did not trust it.",
}
NOTES_WIN = [
 "Asia high swept at the London open, 5m CHoCH two candles later, entry on the retest of the break. Ran to the opposing pool.",
 "First tap of the 4H order block after the Daily displacement. Left it alone until the 15m confirmed.",
 "Trend pullback into the unmitigated gap, filled the 50% and continued. Textbook.",
 "Old demand turned supply, retested clean from underneath. Held the full target.",
 "Inducement below the pullback taken, then OTE entry. Stop never came close.",
 "Equal highs were the obvious draw. Entered discount, let it run into them.",
 "New York open reversal off the London high. SMT on the correlated pair confirmed it.",
 "Daily bias down, 4H breaker held on the retest, target was the prior session low.",
]
NOTES_LOSS = [
 "Sweep never came — entered into the level and the pool above got taken with me in it.",
 "Structure looked broken on the 5m but it was a liquidity grab, not a CHoCH.",
 "Correct setup, wrong side of the Daily. Stopped at the origin.",
 "Order block was a second tap, not a first. Already mitigated.",
 "Entered mid-displacement instead of waiting for the pullback. No room to the stop.",
 "Gap was already filled once. Not an imbalance any more.",
 "News at the open ran both sides. Nothing wrong with the read, wrong time to be in.",
]
NOTES_BE = [
 "Reacted from the block, stalled under the target, closed flat at the session end.",
 "Entry was right, the draw dried up. Took it off at entry rather than hope.",
]

# --- Month plans: R-sequences that sum exactly to the requested returns ---
# net R = target% / RISK%
PLAN = {
  # (year, month): (wins, breakevens, losses)
  (2026,6): ([2.0,2.8,2.1,1.9,1.6,2.4,1.2], [0.0,0.0], [-1.0]*9 + [-0.5,-0.5]),          # +4.0R  = +2.00%
  (2026,7): ([2.2,3.6,2.9,3.1,2.4,1.8,1.3,1.4], [0.0,0.0], [-1.0]*10 + [-0.5,-0.5]),     # +7.7R  = +3.85%
  (2026,8): ([5.5,3.8,3.2,2.9,2.6,2.2,1.9,3.1,2.4], [0.0,0.0], [-1.0]*11 + [-0.5,-0.5]), # +15.6R = +7.80%
}


# ---------------- Missed trades ----------------
MISSED_REASONS=["Was not at the screen","Waited for a confirmation that never came",
                "Did not trust the setup","Already at max trades for the day",
                "Entry was outside my session","Talked myself out of it"]
MISSED_NOTES=[
 "Sweep and CHoCH both there. I was still reading the news and the entry was gone in four candles.",
 "Wanted the 5m to close back inside the block before entering. It never did and ran 4R without me.",
 "Perfect first tap of the Daily order block. Hesitated because the last two of these lost.",
 "Two trades already down for the day, so the rule kept me out. Right call, still worth logging.",
 "Setup formed at the Asia open, outside the hours in my plan.",
 "Called it out loud, then convinced myself the HTF was against it. It was not.",
 "Inducement taken, OTE tagged, closed at the opposing pool. Textbook and I watched it.",
 "Saw it late — price was already mid-leg and there was no entry left with a sensible stop.",
]
def build_missed(trades):
    out=[]; rnd=random.Random(7)
    days=sorted({t["date"] for t in trades})
    for i,day in enumerate(rnd.sample(days,12)):
        sym=rnd.choice(PAIRS); setup=rnd.choice(SETUPS)[0]
        r=round(rnd.choice([1.8,2.2,2.6,3.0,3.4,4.0,4.5]),1)
        out.append({
          "id":"ms_%02d"%(i+1), "date":day, "symbol":sym,
          "direction":rnd.choice(["long","short"]), "setup":setup,
          "reasons":[rnd.choice(MISSED_REASONS)],
          "whatHappened":rnd.choice(MISSED_NOTES),
          "entryType":"", "timeframe":rnd.choice(TFS),
          "riskGrade":"", "r":r,
          "slPips":round(rnd.uniform(7,24),1),
          "pnl":round(sum(r*(RISK/100)*a["size"] for a in ACCOUNTS),2),
          "accounts":[dict(a) for a in ACCT_REF],
          "shots":[], "lessonId":None,
        })
    return sorted(out,key=lambda m:m["date"])

# ---------------- Preparation history ----------------
# One row per trading day, so "Result by preparation" has days on both sides of
# the line and the preparation index is not a flat zero.
MORNING=["wake","hydrate","coffee","move","clear"]
EVENING=["ev_journal","ev_shots","ev_missed"]
def build_preplog(trades):
    rnd=random.Random(23); log={}
    for day in sorted({t["date"] for t in trades}):
        # preparation improves across the three months, which is what makes the
        # comparison against results worth looking at
        mon=int(day[5:7]); base={6:0.45,7:0.7,8:0.9}.get(mon,0.6)
        m=sum(1 for _ in MORNING if rnd.random()<base)
        e=sum(1 for _ in EVENING if rnd.random()<base)
        news=rnd.random()<base; forecast=rnd.random()<base; plan=rnd.random()<base+0.05
        parts=[m/len(MORNING)*100, e/len(EVENING)*100, 100 if plan else 0,
               100 if news else 0, 100 if forecast else 0]
        items={}
        for k in MORNING[:m]: items[k]=True
        for k in EVENING[:e]: items[k]=True
        log[day]={"m":m,"mT":len(MORNING),"e":e,"eT":len(EVENING),
                  "news":news,"forecast":forecast,"plan":plan,
                  "score":round(sum(parts)/len(parts)), "items":items}
    return log

def business_days(y,m):
    d=dt.date(y,m,1); out=[]
    while d.month==m:
        if d.weekday()<5: out.append(d)
        d+=dt.timedelta(days=1)
    return out

trades=[]; n=0; summary={}
for (y,m),(wins,bes,losses) in PLAN.items():
    rs=[("win",r) for r in wins]+[("be",r) for r in bes]+[("loss",r) for r in losses]
    random.shuffle(rs)
    days=business_days(y,m)
    # spread across the month, at most two trades a day (the stated rule)
    slots=[]
    for d in days: slots += [d,d]
    random.shuffle(slots)
    slots=sorted(slots[:len(rs)])
    monthR=0.0
    for i,((kind,r),day) in enumerate(zip(rs,slots)):
        n+=1
        setup=random.choice(SETUPS)[0]
        sess=random.choice(SESSIONS)
        hour = 9 if sess=="London" else 14
        eh=hour+random.randint(0,2); em=random.choice([0,15,30,45])
        dur=random.choice([25,40,55,70,95,130])
        start=dt.datetime(day.year,day.month,day.day,eh,em)
        end=start+dt.timedelta(minutes=dur)
        # confluences: winners carry more of the crucial ones
        k = 5 if kind=="win" else (3 if kind=="be" else 2)
        cfs=sorted(random.sample(range(len(CONFLUENCES)), k))
        mistakes=[]; why=""
        if kind=="loss" and random.random()<0.55:
            mistakes=[random.choice(MISTAKES)]; why=WHY[mistakes[0]]
        if kind=="win" and r<2.0 and random.random()<0.4:
            mistakes=["Closed early"]; why=WHY["Closed early"]
        stars = 5 if r>=3 else (4 if r>=2 else (3 if r>0 else (2 if r==0 else (2 if r==-0.5 else 1))))
        notes = random.choice(NOTES_WIN if kind=="win" else (NOTES_BE if kind=="be" else NOTES_LOSS))
        pnl = round(sum(r*(RISK/100)*a["size"] for a in ACCOUNTS),2)
        monthR+=r
        trades.append({
          "id":"smc_%03d"%n,
          "entryAt":start.strftime("%Y-%m-%dT%H:%M"),
          "closeAt":end.strftime("%Y-%m-%dT%H:%M"),
          "date":day.isoformat(),
          "symbol":random.choice(PAIRS),
          "side":random.choice(["long","short"]),
          "session":sess,
          "entryType":"", "timeframe":random.choice(TFS),
          "setup":setup, "setupStars":stars,
          "riskGrade":"Low risk" if not mistakes else "Invalid",
          "slPips":round(random.uniform(6,28),1),
          "r":r, "accounts":[dict(a) for a in ACCT_REF], "pnl":pnl,
          "forecast": kind!="loss" or random.random()<0.6,
          "notes":notes,
          "mistakes":mistakes, "hadMistake":bool(mistakes), "mistakeWhy":why,
          "focus":[], "confluences":[CF_IDS[i] for i in cfs],
          "shots":[], "lessonId":None,
        })
    summary[(y,m)]={"trades":len(rs),"R":round(monthR,10),"pct":round(monthR*RISK,4),
                    "wins":len(wins),"losses":len(losses),"be":len(bes)}

trades.sort(key=lambda t:(t["date"],t["entryAt"]))
print("month        trades   W/L/BE      net R     return")
for k,v in summary.items():
    print("%d-%02d      %3d   %2d/%2d/%2d   %+8.2fR   %+6.2f%%"%(k[0],k[1],v["trades"],v["wins"],v["losses"],v["be"],v["R"],v["pct"]))
tot=sum(v["R"] for v in summary.values())
print("total        %3d                %+8.2fR   %+6.2f%% per account"%(len(trades),tot,tot*RISK))
for a in ACCOUNTS:
    print("   %-20s %s"%(a["name"],"$%,.2f".replace("%,",  "%")%0 if False else "${:,.2f}".format(tot*RISK/100*a["size"])))
print("   combined dollars     ${:,.2f}".format(sum(tot*RISK/100*a["size"] for a in ACCOUNTS)))

MISSED=build_missed(trades)
PREPLOG=build_preplog(trades)
print("   missed trades        %d"%len(MISSED))
print("   prep-logged days     %d  (avg score %d)"%(len(PREPLOG), sum(v["score"] for v in PREPLOG.values())//max(1,len(PREPLOG))))

json.dump({"trades":trades,"accounts":ACCOUNTS,"missed":MISSED,"preplog":PREPLOG,
           "confluences":[{"id":CF_IDS[i],"name":c[0],"desc":c[1],"crucial":c[2]} for i,c in enumerate(CONFLUENCES)],
           "playbook":[{"id":"pb_smc_%d"%i,"name":s[0],"about":s[1],"plan":s[2],"shots":[]} for i,s in enumerate(SETUPS)],
           "pairs":sorted({t["symbol"] for t in trades})},
          open(os.path.join(HERE,"parts.json"),"w"))
