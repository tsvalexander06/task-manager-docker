import os, json, datetime as dt
HERE=os.path.dirname(os.path.abspath(__file__))
P=json.load(open(os.path.join(HERE,"parts.json")))
trades=P["trades"]

def week_start(d):
    return d - dt.timedelta(days=(d.weekday()))      # Monday-start, as the app uses

# One review per completed week; the current week is deliberately left open.
weeks=sorted({week_start(dt.date.fromisoformat(t["date"])) for t in trades})
PLANS=[
 ["Only trade after the sweep — no early fills","Two setups a day maximum","London and New York only"],
 ["Wait for CHoCH before every entry","Leave the stop where it was placed","No trades against the Daily"],
 ["First tap of the order block only","Let the runner reach the opposing pool","Log the trade before the next one"],
 ["Screenshot the HTF before entry, not after","No re-entries on the same idea","Stop at two losses a day"],
 ["Trade the plan I wrote on Sunday","Do not move to break-even on a normal retrace","Journal every entry same day"],
]
SIGS=[
 "Best week of the month. Every winner came from a swept pool — the losers were all entries without one.",
 "Flat week. Nothing wrong with the reads, the draw dried up mid-week and I forced two.",
 "Two clean order-block taps carried the whole week. The rest was noise I should not have taken.",
 "Took a loss on Monday and spent Tuesday trying to get it back. That is the pattern to kill.",
 "Held a runner to the opposing liquidity for once and it paid for three losers.",
 "Discipline was there. Structure gave me very little — right to sit on my hands Thursday and Friday.",
 "Best month so far. The change was waiting for the CHoCH instead of assuming it.",
 "Ended the month strong. Every A+ entry had the sweep, the CHoCH and the HTF behind it.",
]
REVIEWS={}
for i,w in enumerate(weeks[:-1]):
    REVIEWS["W-"+w.isoformat()]={
      "plan":PLANS[i%len(PLANS)],
      "reviewed":True,
      "completedAt":(w+dt.timedelta(days=6)).isoformat()+"T18:00:00.000Z",
      "signature":SIGS[i%len(SIGS)],
    }
REVIEWS["W-"+weeks[-1].isoformat()]={"plan":PLANS[0],"reviewed":False}

LESSONS=[
 {"id":"ls_smc_1","problem":"Entered before the sweep",
  "why":"The level looks ready and the pool above still has not been taken.",
  "solution":"No entry until the obvious high or low is swept. If it has not run, the trade has not started.",
  "reminder":"No sweep, no trade.","occurrences":0,"active":True,"source":"mistake",
  "createdAt":1,"lastAt":1},
 {"id":"ls_smc_2","problem":"Moved stop",
  "why":"A normal retrace into the entry feels like being wrong.",
  "solution":"The stop goes beyond the sweep wick and stays there. Position size is what controls risk, not the stop.",
  "reminder":"The stop does not move.","occurrences":0,"active":True,"source":"mistake",
  "createdAt":2,"lastAt":2},
 {"id":"ls_smc_3","problem":"Against HTF bias",
  "why":"A clean 15m setup is tempting even when the Daily disagrees.",
  "solution":"Check the Daily and 4H before the entry timeframe. If they disagree, it is not the setup.",
  "reminder":"Daily first, then the entry.","occurrences":0,"active":True,"source":"mistake",
  "createdAt":3,"lastAt":3},
]
SEVERITY={"Entered before the sweep":"crucial","No CHoCH confirmation":"crucial",
          "Against HTF bias":"crucial","Chased the displacement":"small",
          "Moved stop":"crucial","Closed early":"small"}
DNA={"strengths":[{"id":"d_smc_1","text":"Patient with the sweep — will sit out a whole session"},
                  {"id":"d_smc_2","text":"Risk is identical on every trade, no exceptions"},
                  {"id":"d_smc_3","text":"Journals same day, while the chart is fresh"}],
     "nonNegotiables":[{"id":"d_smc_4","text":"0.5% a trade. Never two."},
                       {"id":"d_smc_5","text":"Two losses and the day is over."},
                       {"id":"d_smc_6","text":"No trade without a swept pool behind it."}]}

kv={
 "falcon:trades":json.dumps(trades),
 "falcon:accounts":json.dumps(P["accounts"]),
 "falcon:playbook":json.dumps(P["playbook"]),
 "falcon:confluences":json.dumps(P["confluences"]),
 "falcon:symbols":json.dumps(P["pairs"]),
 "falcon:reviews":json.dumps(REVIEWS),
 "falcon:lessons":json.dumps(LESSONS),
 "falcon:mistakeSeverity":json.dumps(SEVERITY),
 "falcon:dna":json.dumps(DNA),
 "falcon:profile":json.dumps({"name":"SMC Tester","onboarded":True}),
 "falcon:missed":json.dumps([]),
 "falcon:workshop":json.dumps([]),
 "falcon:preplog":json.dumps({}),
 "falcon:dataVersion":"7",
}
payload={"format":1,"exportedAt":dt.datetime(2026,9,1,9,0).isoformat()+"Z",
         "trader":"SMC Tester","counts":{"trades":len(trades)},"kv":kv,"shots":{}}
out=os.path.join(HERE,"odyssey-smc-test-record.json")
json.dump(payload,open(out,"w"))
import os
print("wrote",out, "%.0f KB"%(os.path.getsize(out)/1024))
print("trades",len(trades),"| reviews",len(REVIEWS),"| setups",len(P["playbook"]),"| confluences",len(P["confluences"]),"| accounts",len(P["accounts"]))
