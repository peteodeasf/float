"""The default process checklist an organization starts with.

Single source of truth for both paths that create it: the seed migration
(b9f1c2d3e4a5) for organizations that already existed, and `create_organization`
for every organization made afterwards.

The KEYS matter. Per-patient completion is stored as a key -> bool map on
`patient_checklists`, so these must stay byte-identical to the keys the frontend
shipped with — changing one silently un-ticks it for every patient.
"""

DEFAULT_PROCESS_CHECKLIST: list[dict] = [
    dict(key='parent_review_monitoring', text='Review monitoring data with parent — validate their observations'),
    dict(key='parent_trigger_list', text='Compile trigger situation list with initial DT ratings'),
    dict(key='parent_behaviors', text="Identify the child's safety behaviors, avoidance behaviors, and rituals per situation"),
    dict(key='parent_responses', text='Identify parental responses and accommodation behaviors'),
    dict(key='parent_feared_outcome', text='Ask: "Do you have a sense of what the child fears would happen in that situation?"'),
    dict(key='parent_explain_cbt', text='Explain what CBT is and why it works', link_icon='📖', link_label='View guide'),
    dict(key='parent_explain_exposures', text='Explain what exposures are and how they work', link_icon='📖', link_label='View guide'),
    dict(key='parent_worry_hill', text="Explain the Worry Hill using the child's examples", link_icon='📖', link_label='View Worry Hill'),
    dict(key='parent_nickname', text='Introduce the anxiety nickname concept'),
    dict(key='parent_dt', text='Introduce the Distress Thermometer'),
    dict(key='parent_accommodation', text='Introduce parental accommodation and its impact'),
    dict(key='parent_next_steps', text='Agree next steps — does the family want to proceed?'),
    dict(key='patient_what_help', text='Ask what the child wants help with — use discovery questions', link_icon='📖', link_label='Discovery questions'),
    dict(key='patient_triggers', text='Identify triggers and generate trigger situation list with the child'),
    dict(key='patient_behaviors', text='Identify safety/avoidance behaviors and rituals per situation'),
    dict(key='patient_nickname', text='Confirm anxiety nickname with the child'),
    dict(key='patient_dt_practice', text='Practice the Distress Thermometer together'),
    dict(key='patient_checkin', text='Check in — nickname use, DT use since last session'),
    dict(key='patient_worry_hill_video', text='Teach the Worry Hill — watch video together', link_icon='🎬', link_label='Worry Hill video'),
    dict(key='patient_worry_hill_draw', text="Draw the Worry Hill with the child's own situation", link_icon='📖', link_label='Worry Hill guide'),
    dict(key='patient_candy_jar', text='Teach the Candy Jar analogy', link_icon='📖', link_label='Candy Jar guide'),
    dict(key='patient_da', text='Complete Downward Arrows for primary situations', nav_label='→ Patient Downward Arrows below', nav_action='scrollDA'),
    dict(key='patient_checkin_3', text='Check in — nickname and DT use'),
    dict(key='patient_ladder', text='Build the exposure ladder from the trigger list', nav_label='→ Go to Build Treatment Plan', nav_action='treatmentPlan'),
    dict(key='patient_first_rung', text='Choose the first exposure with the child — lowest DT rung'),
    dict(key='patient_first_exposure', text='Practice the first exposure in session 3-6 times, record DT each time'),
    dict(key='patient_confidence', text='Confirm child confidence is High before first home experiment'),
    dict(key='patient_home_experiments', text='Set the first home experiments with the child'),
]
