import asyncio
import uuid
import json
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
import bcrypt

DATABASE_URL = 'postgresql+asyncpg://postgres:FwINIuaqqfrtXhIZTPgruLqyDEphqcSX@junction.proxy.rlwy.net:51458/railway'
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

ORG_ID = '4c3ab2a9-4cde-43d4-8053-aa458cea64a3'
PRACTITIONER_USER_ID = '96e7673f-40a1-49e8-bd52-77f9d45c8631'

PATIENT_USER_ID = str(uuid.uuid4())
PATIENT_ID = str(uuid.uuid4())
PLAN_ID = str(uuid.uuid4())

SIT_CAFETERIA_ID = str(uuid.uuid4())
SIT_RAISING_HAND_ID = str(uuid.uuid4())
SIT_TALKING_NEW_ID = str(uuid.uuid4())

BEH_HEADPHONES_ID = str(uuid.uuid4())
BEH_BATHROOM_ID = str(uuid.uuid4())
BEH_FRIEND_ID = str(uuid.uuid4())
BEH_NOTRAISE_ID = str(uuid.uuid4())
BEH_PRETEND_ID = str(uuid.uuid4())

DA_CAF_ID = str(uuid.uuid4())

today = date.today()

def days_ago(d): return today - timedelta(days=d)

async def seed():
    async with AsyncSessionLocal() as session:

        # 1. Patient user
        pwd = bcrypt.hashpw(b'Sarah2026!', bcrypt.gensalt()).decode()
        await session.execute(text("""
            INSERT INTO users (id, email, password_hash, created_at, updated_at)
            VALUES (:id, :email, :pwd, now(), now())
            ON CONFLICT (email) DO NOTHING
        """), {'id': PATIENT_USER_ID, 'email': 'sarah.demo@floatcbt.com', 'pwd': pwd})

        await session.execute(text("""
            INSERT INTO user_roles (user_id, role, organization_id)
            VALUES (:uid, 'patient', :org)
            ON CONFLICT DO NOTHING
        """), {'uid': PATIENT_USER_ID, 'org': ORG_ID})

        # 2. Patient profile
        await session.execute(text("""
            INSERT INTO patient_profiles (
                id, user_id, organization_id, name, email,
                date_of_birth, gender, primary_practitioner_id, created_at, updated_at
            ) VALUES (
                :id, :uid, :org, 'Sarah Mitchell', 'sarah.demo@floatcbt.com',
                '2010-03-12', 'Female', :prac, now(), now()
            ) ON CONFLICT DO NOTHING
        """), {'id': PATIENT_ID, 'uid': PATIENT_USER_ID, 'org': ORG_ID, 'prac': PRACTITIONER_USER_ID})

        # 3. Treatment plan
        await session.execute(text("""
            INSERT INTO treatment_plans (
                id, patient_id, organization_id, status, nickname,
                primary_practitioner_id, created_at, updated_at
            ) VALUES (
                :id, :pid, :org, 'active', 'The Voice',
                :prac, now(), now()
            ) ON CONFLICT DO NOTHING
        """), {'id': PLAN_ID, 'pid': PATIENT_ID, 'org': ORG_ID, 'prac': PRACTITIONER_USER_ID})

        # 4. Trigger situations
        situations = [
            (SIT_CAFETERIA_ID, 'Eating lunch in the cafeteria', 6, True, 0),
            (SIT_RAISING_HAND_ID, 'Raising hand to answer a question in class', 7, True, 1),
            (SIT_TALKING_NEW_ID, 'Talking to someone new at school', 8, False, 2),
        ]
        for sid, name, dt, active, order in situations:
            await session.execute(text("""
                INSERT INTO trigger_situations (
                    id, treatment_plan_id, organization_id, name,
                    distress_thermometer_rating, is_active, display_order, created_at
                ) VALUES (
                    :id, :plan, :org, :name, :dt, :active, :order, now()
                ) ON CONFLICT DO NOTHING
            """), {'id': sid, 'plan': PLAN_ID, 'org': ORG_ID, 'name': name,
                   'dt': dt, 'active': active, 'order': order})

        # 5. Behaviors — cafeteria
        caf_behaviors = [
            (BEH_HEADPHONES_ID, 'Wears headphones so nobody talks to her', 'safety', 5),
            (BEH_BATHROOM_ID, 'Eats in the bathroom or library to avoid cafeteria', 'avoidance', 8),
            (BEH_FRIEND_ID, 'Only goes to cafeteria if a close friend is with her', 'safety', 6),
        ]
        for bid, name, btype, dt in caf_behaviors:
            await session.execute(text("""
                INSERT INTO avoidance_behaviors (
                    id, trigger_situation_id, organization_id, name,
                    behavior_type, distress_thermometer, created_at, updated_at
                ) VALUES (
                    :id, :sit, :org, :name, :btype, :dt, now(), now()
                ) ON CONFLICT DO NOTHING
            """), {'id': bid, 'sit': SIT_CAFETERIA_ID, 'org': ORG_ID,
                   'name': name, 'btype': btype, 'dt': dt})

        # 6. Behaviors — raising hand
        rh_behaviors = [
            (BEH_NOTRAISE_ID, "Doesn't raise hand even when she knows the answer", 'avoidance', 7),
            (BEH_PRETEND_ID, 'Pretends to look at notes to avoid eye contact with teacher', 'safety', 5),
        ]
        for bid, name, btype, dt in rh_behaviors:
            await session.execute(text("""
                INSERT INTO avoidance_behaviors (
                    id, trigger_situation_id, organization_id, name,
                    behavior_type, distress_thermometer, created_at, updated_at
                ) VALUES (
                    :id, :sit, :org, :name, :btype, :dt, now(), now()
                ) ON CONFLICT DO NOTHING
            """), {'id': bid, 'sit': SIT_RAISING_HAND_ID, 'org': ORG_ID,
                   'name': name, 'btype': btype, 'dt': dt})

        # 7. Downward Arrow — cafeteria situation
        da_steps = [
            {"question": "What will happen if you sit in the cafeteria without headphones?",
             "answer": "People will notice me sitting alone and stare at me."},
            {"question": "What will happen if people stare at you?",
             "answer": "They'll think I'm a loser with no friends."},
            {"question": "What will happen if they think you have no friends?",
             "answer": "They'll start talking about me and laughing behind my back."},
            {"question": "What will happen if they laugh behind your back?",
             "answer": "Everyone in school will find out and nobody will ever want to be my friend."},
        ]
        await session.execute(text("""
            INSERT INTO downward_arrows (
                id, trigger_situation_id, organization_id,
                arrow_steps, feared_outcome, feared_outcome_approved,
                bip_derived, facilitated_by, created_at, updated_at
            ) VALUES (
                :id, :sit, :org,
                :steps::jsonb, :outcome, true,
                75.0, 'practitioner', now(), now()
            ) ON CONFLICT DO NOTHING
        """), {
            'id': DA_CAF_ID,
            'sit': SIT_CAFETERIA_ID,
            'org': ORG_ID,
            'steps': json.dumps(da_steps),
            'outcome': "Everyone in school will find out I have no friends and nobody will ever want to be my friend."
        })

        # 8. Experiments — headphones behavior, 3x/week for 3 weeks
        experiments = [
            # 3 weeks ago
            (days_ago(21), 75, 60, 6, 5, False,
             "It was really scary at first but I got through it. Nobody actually looked at me."),
            (days_ago(19), 60, 55, 5, 4, False,
             "Easier than the first time. Still felt weird but I managed to stay the whole lunch."),
            (days_ago(17), 55, 50, 5, 3, False,
             "Starting to think maybe people aren't watching me as much as I thought."),
            # 2 weeks ago
            (days_ago(14), 50, 45, 5, 4, False,
             "Sat a bit closer to other people today. Nothing bad happened."),
            (days_ago(12), 45, 40, 4, 3, False,
             "The Voice said everyone would stare. Nobody did. The Voice was wrong again."),
            (days_ago(10), 40, 35, 4, 2, False,
             "Made brief eye contact with someone and they just smiled. That was unexpected."),
            # 1 week ago
            (days_ago(7), 35, 30, 4, 3, False,
             "Sat right in the middle of the cafeteria. Heart was pounding but I stayed the whole lunch."),
            (days_ago(5), 30, 25, 3, 2, False,
             "Someone sat near me and we didn't talk but it felt okay. Almost normal."),
            (days_ago(3), 25, 20, 3, 2, False,
             "Starting to feel almost normal in there. Hard to believe this was so scary a few weeks ago."),
        ]

        feared_outcome = "Everyone in school will find out I have no friends and nobody will ever want to be my friend."

        for exp_date, bip_before, bip_after, dt_exp, dt_actual, feared_occurred, learned in experiments:
            exp_id = str(uuid.uuid4())
            await session.execute(text("""
                INSERT INTO experiments (
                    id, avoidance_behavior_id, patient_id, organization_id,
                    status, scheduled_date, completed_date,
                    bip_before, bip_after,
                    confidence_level, plan_description, prediction,
                    distress_thermometer_expected, distress_thermometer_actual,
                    feared_outcome_occurred, what_learned,
                    created_at, updated_at
                ) VALUES (
                    :id, :bid, :pid, :org,
                    'completed', :sdate, :sdate,
                    :bip_before, :bip_after,
                    'high', 'Sit in the cafeteria without headphones for the full lunch period',
                    :prediction,
                    :dt_exp, :dt_actual,
                    :feared, :learned,
                    now(), now()
                ) ON CONFLICT DO NOTHING
            """), {
                'id': exp_id, 'bid': BEH_HEADPHONES_ID,
                'pid': PATIENT_ID, 'org': ORG_ID,
                'sdate': exp_date,
                'bip_before': bip_before, 'bip_after': bip_after,
                'prediction': feared_outcome,
                'dt_exp': dt_exp, 'dt_actual': dt_actual,
                'feared': feared_occurred, 'learned': learned
            })

        # 9. Upcoming experiments — committed this week
        upcoming = [
            (today + timedelta(days=1), 'Make eye contact and smile at someone sitting nearby', 'high'),
            (today + timedelta(days=3), 'Make eye contact and smile at someone sitting nearby', 'high'),
            (today + timedelta(days=5), 'Make eye contact and smile at someone sitting nearby', 'high'),
        ]
        for udate, desc, conf in upcoming:
            exp_id = str(uuid.uuid4())
            await session.execute(text("""
                INSERT INTO experiments (
                    id, avoidance_behavior_id, patient_id, organization_id,
                    status, scheduled_date, bip_before,
                    confidence_level, plan_description, prediction,
                    created_at, updated_at
                ) VALUES (
                    :id, :bid, :pid, :org,
                    'committed', :sdate, 20,
                    :conf, :desc, :prediction,
                    now(), now()
                ) ON CONFLICT DO NOTHING
            """), {
                'id': exp_id, 'bid': BEH_HEADPHONES_ID,
                'pid': PATIENT_ID, 'org': ORG_ID,
                'sdate': udate, 'conf': conf, 'desc': desc,
                'prediction': feared_outcome
            })

        # 10. Session notes
        notes = [
            ('consultation_1', days_ago(35),
             "Session 1 — Parent only. Met with Sarah's mother, Jennifer. Jennifer described Sarah's anxiety as significantly impacting her school life — avoiding the cafeteria, refusing to attend school events, declining invitations from classmates. Identified 3 primary trigger situations. Introduced the CBT model and family accommodation concept. Jennifer acknowledged she has been allowing Sarah to eat lunch in her car on bad days. Discussed gradual reduction plan for accommodation. Sarah's nickname for her anxiety: 'The Voice'. Monitoring form reviewed — clear pattern of cafeteria and classroom avoidance."),
            ('consultation_2', days_ago(28),
             "Session 2 — Sarah and Jennifer. Introduced Sarah to the model. She was quiet initially but engaged when we discussed The Voice. Practiced the Distress Thermometer together — Sarah rated cafeteria at 6, raising hand at 7. Explained Worry Hill using the graphic. Sarah understood immediately — said 'so if I just stay, it goes down?' Completed first Downward Arrow for cafeteria situation together — feared outcome: 'Everyone will find out I have no friends and nobody will want to be my friend.' BIP set at 75%. Sarah agreed to try the headphones experiment 3x this week. Jennifer practiced non-accommodating response: 'I know this is hard. I believe you can do this.'"),
            ('weekly_session', days_ago(7),
             "Week 3 check-in. Sarah arrived looking noticeably more relaxed than previous sessions. Reviewed 9 completed experiments — BIP down from 75% to 20%, DT consistently dropping from 6 to 2-3. Sarah said 'The Voice is getting quieter.' Key insight this week: 'I realized nobody is actually watching me. I was the only one who thought they were.' Jennifer reported she has not allowed car lunches in 3 weeks — accommodation reduction on track. Sarah is ready to move to the next behavior. New action plan: eye contact and smile experiment 3x next week. Discussed moving to the raising hand situation once cafeteria ladder is complete — Sarah said she's actually looking forward to it."),
        ]
        for ntype, ndate, content in notes:
            note_id = str(uuid.uuid4())
            await session.execute(text("""
                INSERT INTO session_notes (
                    id, patient_id, organization_id, practitioner_id,
                    session_type, content, session_date, created_at, updated_at
                ) VALUES (
                    :id, :pid, :org, :prac,
                    :ntype, :content, :ndate, now(), now()
                ) ON CONFLICT DO NOTHING
            """), {
                'id': note_id, 'pid': PATIENT_ID, 'org': ORG_ID,
                'prac': PRACTITIONER_USER_ID,
                'ntype': ntype, 'content': content, 'ndate': ndate
            })

        # 11. Action plan
        ap_id = str(uuid.uuid4())
        ap_content = """<p>Hi Sarah,</p>
<p>Great work this week — <strong>The Voice is getting quieter</strong> and your numbers show it. BIP down to 20%, fear level down to 2. That's real progress.</p>
<p><strong>Your experiments this week:</strong></p>
<ul>
<li>Monday, Wednesday, Friday at lunch — sit in the cafeteria as usual</li>
<li>This time: make eye contact with someone nearby and smile</li>
<li>You don't need to say anything — just a smile is enough</li>
</ul>
<p><strong>Your prediction to test:</strong> "Everyone will find out I have no friends and nobody will want to be my friend."</p>
<p>After each experiment, record what actually happened. Was The Voice right?</p>
<p>I believe you can do this.</p>
<p>— Dr. Walker</p>"""

        await session.execute(text("""
            INSERT INTO action_plans (
                id, patient_id, organization_id, practitioner_id,
                content, visible_to_patient, session_number, session_date,
                created_at, updated_at
            ) VALUES (
                :id, :pid, :org, :prac,
                :content, true, 3, :sdate,
                now(), now()
            ) ON CONFLICT DO NOTHING
        """), {
            'id': ap_id, 'pid': PATIENT_ID, 'org': ORG_ID,
            'prac': PRACTITIONER_USER_ID,
            'content': ap_content,
            'sdate': days_ago(7)
        })

        await session.commit()
        print("✓ Demo patient Sarah Mitchell created successfully")
        print(f"  Patient ID:  {PATIENT_ID}")
        print(f"  Teen login:  sarah.demo@floatcbt.com / Sarah2026!")
        print(f"  Login URL:   https://app.floatcbt.com/teen/login")

asyncio.run(seed())
