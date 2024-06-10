import LogicFlow, { h } from '@logicflow/core'
import {
  RectResizeModel,
  RectResizeView,
  type ResizeNodeConfig,
} from '../../NodeResize'
import { Group } from '.'

import NodeData = LogicFlow.NodeData
import Point = LogicFlow.Point
import EdgeConfig = LogicFlow.EdgeConfig

const defaultWidth = 500
const defaultHeight = 300
const DEFAULT_BOTTOM_Z_INDEX = -10000

export type GroupNodeConfig = ResizeNodeConfig & {
  children?: string[]
}

export class GroupNodeModel extends RectResizeModel {
  readonly isGroup = true
  /**
   * 此分组的子节点Id
   */
  children!: Set<string>
  /**
   * 其子节点是否被禁止通过拖拽移出分组。 默认false，允许拖拽移除分组。
   */
  isRestrict?: boolean
  /**
   * 分组节点是否允许调整大小。
   */
  resizable?: boolean
  /**
   * 分组节点是否允许折叠
   */
  foldable?: boolean
  /**
   * 折叠后的宽度
   */
  foldedWidth!: number
  /**
   * 折叠后的高度
   */
  foldedHeight!: number
  /**
   * 分组折叠状态
   */
  isFolded!: boolean
  unfoldedWidth = defaultWidth
  unfoldedHeight = defaultHeight
  /**
   * children元素上一次折叠的状态缓存
   */
  childrenLastFoldStatus: Record<string, boolean> = {}

  initNodeData(data: GroupNodeConfig) {
    super.initNodeData(data)
    let children: string[] = []
    if (Array.isArray(data.children)) {
      children = data.children
    }
    // 初始化组的子节点
    this.children = new Set(children)
    this.width = defaultWidth
    this.height = defaultHeight
    this.foldedWidth = 80
    this.foldedHeight = 60
    this.zIndex = DEFAULT_BOTTOM_Z_INDEX
    this.radius = 0
    this.text.editable = false
    this.text.draggable = false
    this.isRestrict = false
    this.resizable = false
    this.autoToFront = false
    this.foldable = false
    this.isFolded = false
    if (this.properties.isFolded === undefined) {
      this.properties.isFolded = false
    }
    // fixme: 虽然默认保存的分组不会收起，但是如果重写保存数据分组了，
    // 此处代码会导致多一个history记录
    setTimeout(() => {
      this.foldGroup(!!this.properties.isFolded)
    })
  }

  getResizeOutlineStyle() {
    const style = super.getResizeOutlineStyle()
    style.stroke = 'none'
    return style
  }

  getAnchorStyle(anchorInfo?: Point) {
    const style = super.getAnchorStyle(anchorInfo)
    style.stroke = 'transparent'
    style.fill = 'transparent'
    style.hover!.fill = 'transparent' // TODO: 确认这种情况如何解决，style.hover 为 undefined 时该如何处理
    style.hover!.stroke = 'transparent'
    return style
  }

  /**
   * 折叠/展开分组
   * @param isFolded `true` 折叠分组，`false` 展开分组
   */
  foldGroup(isFolded: boolean) {
    this.foldGroupAction(isFolded, false)
  }

  /**
   * 内部方法，处理分组的折叠/展开
   * @param isFolded `true` 折叠分组，`false` 展开分组
   * @param isChildren 是否为嵌套的子分组
   */
  private foldGroupAction(isFolded: boolean, isChildren = true) {
    if (isFolded === this.isFolded) {
      // 防止多次调用同样的状态设置
      // 如果this.isFolded=false，同时触发foldGroup(false)，会导致下面的childrenLastFoldStatus状态错乱
      return
    }
    this.setProperty('isFolded', isFolded)
    this.isFolded = isFolded
    isFolded ? this.flodAction(isChildren) : this.unflodAction(isChildren)
  }

  /**
   * 内部方法，折叠分组
   * 1. 折叠分组
   * 2. 递归处理子分组（折叠&隐藏）
   * 3. 处理连线
   * @param isChildren 是否为嵌套的子分组
   */
  private flodAction(isChildren: boolean) {
    const isFolded = true
    // step 1
    this.x = this.x - this.width / 2 + this.foldedWidth / 2
    this.y = this.y - this.height / 2 + this.foldedHeight / 2
    this.unfoldedWidth = this.width
    this.unfoldedHeight = this.height
    this.width = this.foldedWidth
    this.height = this.foldedHeight
    // step 2
    this.children.forEach((nodeId) => {
      const nodeModel = this.graphModel.getNodeModelById(nodeId)
      if (nodeModel) {
        if (nodeModel.isGroup) {
          // FIX: https://github.com/didi/LogicFlow/issues/1007
          // 存在分组嵌套时，在折叠时需要递归折叠，并存储子分组折叠前的状态
          this.childrenLastFoldStatus[nodeId] = !!nodeModel.isFolded
          ;(nodeModel as GroupNodeModel).foldGroupAction(isFolded)
        }
        nodeModel.visible = !isFolded
      }
    })
    // step 3
    if (!isChildren) this.foldEdge()
  }

  /**
   * 内部方法，展开分组
   * 1. 展开分组
   * 2. 递归处理子分组（展开&显示）
   * 3. 处理连线
   */
  private unflodAction(isChildren: boolean) {
    const isFolded = false
    // step 1
    this.width = this.unfoldedWidth
    this.height = this.unfoldedHeight
    this.x = this.x + this.width / 2 - this.foldedWidth / 2
    this.y = this.y + this.height / 2 - this.foldedHeight / 2
    // step 2
    this.children.forEach((nodeId) => {
      const nodeModel = this.graphModel.getNodeModelById(nodeId)
      if (nodeModel) {
        if (nodeModel.isGroup) {
          // https://github.com/didi/LogicFlow/issues/1145
          // 存在分组嵌套时，在展开后需要将子分组恢复到折叠前的状态
          const lastFoldStatus = !!this.childrenLastFoldStatus[nodeId]
          ;(nodeModel as GroupNodeModel).foldGroupAction(lastFoldStatus)
        }
        nodeModel.visible = !isFolded
      }
    })
    // step 3
    if (!isChildren) this.foldEdge()
  }

  /**
   * 折叠/展开时，处理分组自身的连线和分组内部子节点上的连线
   *
   * 边的分类：
   * - 虚拟边：分组被收起时，表示分组本身与外部节点关系的边。
   * - 真实边：分组本身或者分组内部节点与外部节点节点（非收起分组）关系的边。
   *
   * 如果一个分组，本身与外部节点有M条连线，且内部子节点与外部节点有N条连线，那么这个分组收起时会生成M+N条连线。
   */
  private foldEdge() {
    const edges = this.getAllEdges()

    edges.forEach((edgeModel) => {
      // 删除原有的虚拟边
      if (edgeModel.virtual && edgeModel.isFoldedEdge) {
        this.graphModel.deleteEdgeById(edgeModel.id)
        return
      }

      const { sourceNodeId, targetNodeId, startPoint, endPoint, type, text } =
        edgeModel
      const sourceNode = this.graphModel.getNodeModelById(sourceNodeId)!
      const targetNode = this.graphModel.getNodeModelById(targetNodeId)!
      // 如果真实边的两端均可见，则真实边可见
      if (sourceNode.visible && targetNode.visible) {
        edgeModel.visible = true
        return
      }
      edgeModel.visible = false

      const properties = edgeModel.getProperties()

      const data: EdgeConfig = {
        sourceNodeId,
        targetNodeId,
        startPoint,
        endPoint,
        type,
        properties,
        text: text?.value,
      }

      const group = this.graphModel.group as Group
      const sourceGroupNode = sourceNode.visible
        ? sourceNode
        : group.getNodeGroupVisible(sourceNodeId)!
      const targetGroupNode = targetNode.visible
        ? targetNode
        : group.getNodeGroupVisible(targetNodeId)!

      // 如果真实边的起点和终点在同一个被折叠的分组中，则不创建虚拟边
      if (sourceGroupNode.id === targetGroupNode.id) {
        return
      } else {
        if (sourceGroupNode.id !== sourceNodeId) {
          data.startPoint = undefined
          data.sourceNodeId = sourceGroupNode.id
        }
        if (targetGroupNode.id !== targetNodeId) {
          data.endPoint = undefined
          data.targetNodeId = targetGroupNode.id
        }
        this.createVirtualEdge(data)
      }
    })
  }

  /**
   * 创建虚拟边
   * @param edgeData 边数据
   */
  private createVirtualEdge(edgeData: EdgeConfig) {
    edgeData.pointsList = undefined
    const model = this.graphModel.addEdge(edgeData)
    model.virtual = true
    // 强制不保存group连线数据
    // model.getData = () => null;
    // 虚拟边的文本编辑无法传递给对应的真实边，故禁用虚拟边的文本编辑
    model.text.editable = false
    // 区别于其他用户创建的虚拟边，避免折叠操作时删除用户创建的虚拟边
    model.isFoldedEdge = true
  }

  /**
   * 获取分组及其所有子/孙节点的所有连线
   */
  private getAllEdges() {
    const allEdges = [...this.incoming.edges, ...this.outgoing.edges]
    this.children.forEach((nodeId) => {
      const nodeModel = this.graphModel.getNodeModelById(nodeId)
      if (nodeModel) {
        if (nodeModel.isGroup) {
          allEdges.push(...(nodeModel as GroupNodeModel).getAllEdges())
        } else {
          const incomingEdges = nodeModel.incoming.edges
          const outgoingEdges = nodeModel.outgoing.edges
          allEdges.push(...incomingEdges, ...outgoingEdges)
        }
      }
    })
    // 如果分组的子孙节点之间存在连线，则该会重复获取两次，需要去重
    const edgeIds = new Set<string>()
    return allEdges.filter((edge) => {
      if (edgeIds.has(edge.id)) {
        return false
      }
      edgeIds.add(edge.id)
      return true
    })
  }

  isInRange({ x1, y1, x2, y2 }: Record<'x1' | 'y1' | 'x2' | 'y2', number>) {
    return (
      x1 >= this.x - this.width / 2 &&
      x2 <= this.x + this.width / 2 &&
      y1 >= this.y - this.height / 2 &&
      y2 <= this.y + this.height / 2
    )
  }

  isAllowMoveTo({ x1, y1, x2, y2 }: Record<'x1' | 'y1' | 'x2' | 'y2', number>) {
    return {
      x: x1 >= this.x - this.width / 2 && x2 <= this.x + this.width / 2,
      y: y1 >= this.y - this.height / 2 && y2 <= this.y + this.height / 2,
    }
  }

  setAllowAppendChild(isAllow: boolean) {
    this.setProperty('groupAddable', isAllow)
  }

  /**
   * 添加分组子节点
   * @param id 节点id
   */
  addChild(id: string) {
    this.children.add(id)
    this.graphModel.eventCenter.emit('group:add-node', { data: this.getData() })
  }

  /**
   * 删除分组子节点
   * @param id 节点id
   */
  removeChild(id: string) {
    this.children.delete(id)
    this.graphModel.eventCenter.emit('group:remove-node', {
      data: this.getData(),
    })
  }

  getAddableOutlineStyle() {
    return {
      stroke: '#FEB663',
      strokeWidth: 2,
      strokeDasharray: '4 4',
      fill: 'transparent',
    }
  }

  getData() {
    const data = super.getData()
    data.children = []
    this.children.forEach((childId) => {
      const model = this.graphModel.getNodeModelById(childId)
      if (model && !model.virtual) {
        ;(data.children as string[]).push(childId)
      }
    })
    const { properties } = data
    // TODO: 这两个属性为啥要删除？
    delete properties?.groupAddable
    delete properties?.isFolded
    return data
  }

  // TODO: 如何保证折叠不会引起history的变化
  getHistoryData() {
    const data = super.getData()
    data.children = [...this.children]
    data.isGroup = true
    const { properties } = data
    delete properties?.groupAddable
    delete properties?.isFolded
    if (properties?.isFolded) {
      data.x = data.x + this.unfoldedWidth / 2 - this.foldedWidth / 2
      data.y = data.y + this.unfoldedHeight / 2 - this.foldedHeight / 2
    }
    return data
  }

  /**
   * 是否允许此节点添加到此分组中
   */
  isAllowAppendIn(_nodeData: NodeData) {
    console.info('_nodeData', _nodeData)
    return true
  }

  /**
   * 当groupA被添加到groupB中时，将groupB及groupB所属的group的zIndex减1
   */
  toBack() {
    this.zIndex--
  }
}

export class GroupNode extends RectResizeView {
  getControlGroup(): h.JSX.Element | null {
    const { resizable, properties } = this.props.model
    return resizable && !properties.isFolded ? super.getControlGroup() : null
  }

  getAddableShape(): h.JSX.Element | null {
    const { width, height, x, y, radius, properties, getAddableOutlineStyle } =
      this.props.model as GroupNodeModel
    if (!properties.groupAddable) return null
    const { strokeWidth = 0 } = this.props.model.getNodeStyle()

    const style: Record<string, any> = getAddableOutlineStyle()
    const newWidth = width + strokeWidth + 8
    const newHeight = height + strokeWidth + 8

    return h('rect', {
      ...style,
      width: newWidth,
      height: newHeight,
      x: x - newWidth / 2,
      y: y - newHeight / 2,
      rx: radius,
      ry: radius,
    })
  }

  getFoldIcon(): h.JSX.Element | null {
    const { model } = this.props
    const foldX = model.x - model.width / 2 + 5
    const foldY = model.y - model.height / 2 + 5
    if (!model.foldable) return null
    const iconIcon = h('path', {
      fill: 'none',
      stroke: '#818281',
      strokeWidth: 2,
      'pointer-events': 'none',
      d: model.properties.isFolded
        ? `M ${foldX + 3},${foldY + 6} ${foldX + 11},${foldY + 6} M${
            foldX + 7
          },${foldY + 2} ${foldX + 7},${foldY + 10}`
        : `M ${foldX + 3},${foldY + 6} ${foldX + 11},${foldY + 6} `,
    })
    return h('g', {}, [
      h('rect', {
        height: 12,
        width: 14,
        rx: 2,
        ry: 2,
        strokeWidth: 1,
        fill: '#F4F5F6',
        stroke: '#CECECE',
        cursor: 'pointer',
        x: model.x - model.width / 2 + 5,
        y: model.y - model.height / 2 + 5,
        onClick: () => {
          ;(model as GroupNodeModel).foldGroup(!model.properties.isFolded)
        },
      }),
      iconIcon,
    ])
  }

  getResizeShape(): h.JSX.Element {
    return h('g', {}, [
      this.getAddableShape(),
      super.getResizeShape(),
      this.getFoldIcon(),
    ])
  }
}

export default {
  type: 'group',
  view: GroupNode,
  model: GroupNodeModel,
}
