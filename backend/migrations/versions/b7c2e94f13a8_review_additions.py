"""review additions

The reviewer can write her own suggestions under each situation. Marking ours tells us what is
wrong; writing her own tells us what right looks like.

Not destructive: one new table.

Revision ID: b7c2e94f13a8
Revises: e5b93c27a114
Create Date: 2026-08-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b7c2e94f13a8'
down_revision = 'e5b93c27a114'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'review_additions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('reviewer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_key', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['reviewer_id'], ['review_reviewers.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_review_additions_reviewer', 'review_additions', ['reviewer_id', 'item_key'])


def downgrade() -> None:
    op.drop_index('ix_review_additions_reviewer', table_name='review_additions')
    op.drop_table('review_additions')
