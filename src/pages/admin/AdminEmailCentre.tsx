import React from 'react';
import {AdminLayout} from '../../components/admin/AdminLayout';
import {OutlookEmailCentre} from '../../components/admin/OutlookEmailCentre';

export const AdminEmailCentre:React.FC=()=>(
 <AdminLayout title="Outlook Email Centre" subtitle="Grab voucher fulfilment · nelbd@designsingapore.org">
  <OutlookEmailCentre/>
 </AdminLayout>
);
