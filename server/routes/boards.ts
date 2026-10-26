import { Router } from "express";
import { BOARD_BACKGROUNDS } from "../../shared/types";
import { requireBoard, requireUser, requireWorkspace } from "../access";
import { assertAdmin, canSeeEveryCard, isAssigned } from "../guards";
import { asyncHandler, bodyOf, HttpError, param } from "../http";
import { BoardModel, CardModel, ListModel } from "../models";
import { emitBoard } from "../realtime";
import { boardJson, cardJson, listJson, membershipsForWorkspace } from "../serialize";
import { assertBackground, assertBoardBackdrop, cleanName, optionalText } from "../validate";

export const boardRouter = Router();

boardRouter.post(
  "/workspaces/:workspaceId/boards",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    const workspaceId = param(req.params.workspaceId);
    await requireWorkspace(String(user._id), workspaceId);
    const body = bodyOf(req);
    const title = cleanName(body.title, "Board title", 120);
    const background = body.background === undefined ? BOARD_BACKGROUNDS[0].color : assertBackground(body.background);
    const backgroundImage = body.backgroundImage === undefined ? "" : assertBoardBackdrop(body.backgroundImage);
    const board = await BoardModel.create({
      workspaceId,
      title,
      background,
      backgroundImage,
      createdBy: user._id,
    });
    res.status(201).json(boardJson(board));
  }),
);

boardRouter.get(
  "/boards/:boardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    const { board, membership } = await requireBoard(String(user._id), param(req.params.boardId));
    const [lists, allCards, members] = await Promise.all([
      ListModel.find({ boardId: board._id, deletedAt: null }).sort({ position: 1 }),
      CardModel.find({ boardId: board._id, deletedAt: null }).sort({ position: 1 }),
      membershipsForWorkspace(String(board.workspaceId), false),
    ]);
    const cards = canSeeEveryCard(user) ? allCards : allCards.filter((card) => isAssigned(card.assigneeIds, String(user._id)));
    res.json({
      board: boardJson(board),
      role: membership.role,
      members,
      lists: lists.map((list) =>
        listJson(
          list,
          cards.filter((card) => String(card.listId) === String(list._id)).map((card) => cardJson(card)),
        ),
      ),
    });
  }),
);

boardRouter.patch(
  "/boards/:boardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    const { board } = await requireBoard(String(user._id), param(req.params.boardId));
    const body = bodyOf(req);
    if (body.title !== undefined) board.title = cleanName(body.title, "Board title", 120);
    if (body.background !== undefined) board.background = assertBackground(body.background);
    if (body.backgroundImage !== undefined) board.backgroundImage = assertBoardBackdrop(body.backgroundImage);
    if (body.description !== undefined) board.description = optionalText(body.description, 400) ?? "";
    if (body.closed !== undefined) {
      if (typeof body.closed !== "boolean") throw new HttpError(400, "Closed must be true or false.");
      board.closed = body.closed;
    }
    if (
      body.title === undefined &&
      body.background === undefined &&
      body.backgroundImage === undefined &&
      body.description === undefined &&
      body.closed === undefined
    ) {
      throw new HttpError(400, "Nothing to update.");
    }
    await board.save();
    const dto = boardJson(board);
    emitBoard(String(board._id), "board:updated", { board: dto });
    res.json(dto);
  }),
);

boardRouter.delete(
  "/boards/:boardId",
  asyncHandler(async (req, res) => {
    const user = await requireUser(req);
    assertAdmin(user);
    const { board } = await requireBoard(String(user._id), param(req.params.boardId));
    if (!board.closed) throw new HttpError(400, "Close the board in settings before deleting it.");
    board.set("deletedAt", new Date());
    await board.save();
    res.json({ ok: true });
  }),
);
