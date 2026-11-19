"""Float's own videos, hosted on Mux. docs/plans/videos.md

Additive: one new table. Nothing existing is changed.

Revision ID: e7c1a9f3b2d6
Revises: d4b8f2a6c1e3
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'e7c1a9f3b2d6'
down_revision = 'd4b8f2a6c1e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'videos',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('mux_asset_id', sa.String(), nullable=False),
        sa.Column('mux_playback_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('audience', sa.String(), server_default='clinician', nullable=False),
        sa.Column('duration_seconds', sa.Numeric(8, 2), nullable=True),
        sa.Column('display_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('is_published', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('mux_asset_id', name='uq_videos_mux_asset_id'),
        sa.CheckConstraint("audience IN ('clinician', 'family', 'both')", name='ck_videos_audience'),
    )


def downgrade() -> None:
    op.drop_table('videos')
