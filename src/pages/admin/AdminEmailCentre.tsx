import React from 'react';
import {AdminLayout} from '../../components/admin/AdminLayout';
import {OutlookEmailCentre} from '../../components/admin/OutlookEmailCentre';
import {GrabManualFollowups} from '../../components/admin/GrabManualFollowups';

export const AdminEmailCentre:React.FC=()=>(
 <AdminLayout title="Grab Vouchers" subtitle="Secure voucher inventory and fulfilment · nelbd@designsingapore.org">
  <OutlookEmailCentre/>
  <GrabManualFollowups/>
 </AdminLayout>
);
