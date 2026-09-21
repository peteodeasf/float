"""The default process checklist an organization starts with.

Single source of truth for new organizations (`create_organization` → `seed_defaults`).

The KEYS are identity. Per-patient completion is a key -> bool map on the checklist record,
so changing a key silently un-ticks it for every patient.

Peter, 2026-09-21: replaced the long list with this shorter draft. The old keys are gone, so any
existing ticks against them are orphaned (pre-launch, test data only). This is a draft to be
reviewed and edited properly later.
"""

DEFAULT_PROCESS_CHECKLIST: list[dict] = [
    dict(key='send_monitoring_links', text='Send monitoring links to parents'),
    dict(key='analyze_monitoring_data', text='Analyze monitoring data'),
    dict(key='prep_parent_consultation', text='Prepare for parent consultation meeting'),
    dict(key='parent_first_meeting', text='Parent first meeting'),
    dict(key='prep_parent_child_meeting', text='Prepare for parent-child meeting'),
    dict(key='parent_child_first_meeting', text='Parent-child first meeting'),
    dict(key='child_first_meeting', text='Child first meeting'),
    dict(key='review_cbt_exposure_concepts', text='Review key CBT and exposure concepts'),
    dict(key='setup_exposure_ladder', text='Set up exposure ladder for child'),
    dict(key='setup_accommodation_ladder', text='Set up accommodation ladder for parents'),
    dict(key='child_first_exposure', text="Child's first exposure"),
    dict(key='monitor_progress_exposure_data', text='Monitoring of progress and exposure data'),
]
